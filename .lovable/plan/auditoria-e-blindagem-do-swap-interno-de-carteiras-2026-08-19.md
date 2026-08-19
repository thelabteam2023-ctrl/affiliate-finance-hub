# Auditoria e Blindagem do Swap Interno de Carteiras

## 1. Como o Swap funciona hoje (verificado)

O diálogo `SwapCryptoDialog` grava **duas linhas** em `cash_ledger` direto do frontend (sem RPC):

```text
SWAP_OUT  coin=BTC   qtd_coin=0,033723  valor_usd=2314,54  origem_wallet_id=W
SWAP_IN   coin=USDT  qtd_coin=2169,00   valor_usd=2314,54  destino_wallet_id=W
          referencia_transacao_id -> id do SWAP_OUT
```

Confirmado no caso do Tiago (19/08/2026): as duas pernas existem, com o mesmo `valor_usd` (swap é zero-sum) e a perna IN apontando para a OUT.

Reversão: `reverter_movimentacao_caixa` opera **linha a linha**. Cada perna revertida gera um espelho `AJUSTE_RECONCILIACAO` com direção oposta e mesmo `coin`/`qtd_coin`/`valor_usd`. No caso do Tiago as duas pernas foram revertidas — mas em **dois atos separados, com 13 minutos de diferença e motivos diferentes** ("erro de lançamento" e "Lançamento Errado"). Financeiramente o resultado ficou simétrico; operacionalmente, dependeu do operador lembrar da segunda perna.

## 2. Causa raiz

Três falhas somadas:

1. **Nenhuma etapa de revisão/confirmação.** O botão "Confirmar Swap" executa direto. Não há tela mostrando carteira, proprietário e endereço de origem e destino antes da gravação.
2. **O swap não é uma operação atômica no modelo de dados.** São dois INSERTs independentes no cliente; se o segundo falhar, o primeiro fica órfão (débito sem crédito). Não existe `operation_id` agrupando as pernas.
3. **A reversão não conhece o par.** A RPC reverte uma linha. Reverter só o SWAP_IN deixaria o débito de BTC vivo e o saldo distorcido, sem nenhum aviso.

No histórico, a perna IN mostra a origem como o texto genérico "Swap Interno" e a perna OUT mostra o destino como "Swap Interno" — por isso não dá para ver de quem é a carteira nem qual endereço foi usado.

## 3. Riscos atuais

- Swap para carteira errada sem chance de perceber antes de gravar.
- Perna órfã se o segundo INSERT falhar (rede, RLS, validação).
- Reversão parcial silenciosa (metade do swap desfeita).
- Auditoria pobre: nada liga original ↔ reversão ↔ perna irmã.
- Criação automática de wallet no submit (modo "Outro endereço/rede" + nova rede) sem o usuário revisar o que será criado.

## 4. Proteções que já existem

- Bloqueio de saldo insuficiente na coin de origem.
- Wallet de origem removida da lista de destino no modo "outro endereço".
- Guard de cadeia na reversão (`fn_ledger_reversal_impact`) impede deixar ativo negativo.
- Janela de 24h e restrição a owner/admin para reverter; espelho registrado em `audit_logs`.

## 5. O que falta

- Confirmação final explícita com resumo completo.
- Distinção visual clara entre Cenário A (mesma carteira) e Cenário B (carteira / proprietário diferente).
- Atomicidade das duas pernas.
- Reversão em par.
- Detalhamento no histórico.

---

## Plano de implementação

### Etapa 1 — Backend: swap atômico e rastreável (base de tudo)

Migração criando `fn_registrar_swap_crypto(...)` (SECURITY DEFINER):

- Insere as duas pernas na mesma transação; falha em qualquer ponto desfaz tudo.
- Grava em ambas um `swap_operation_id` (novo uuid) e mantém `referencia_transacao_id` na perna IN.
- Revalida no servidor: saldo suficiente da coin de origem na wallet, wallets pertencentes ao workspace/parceiro, coins diferentes, quantidades > 0.
- Grava metadados de auditoria: wallets, endereços, proprietários e cotações do momento (`cotacao_origem_usd`, `cotacao_destino_usd`, `cotacao_implicita`).
- Idempotência por chave derivada dos parâmetros, evitando duplicidade em duplo clique.

`SwapCryptoDialog` passa a chamar essa RPC no lugar dos dois INSERTs.

### Etapa 2 — Backend: reversão em par

Wrapper `fn_reverter_swap(p_transacao_id, p_motivo)`:

- Localiza as duas pernas pelo `swap_operation_id` (fallback por `referencia_transacao_id` para swaps antigos).
- Roda o guard de impacto existente nas duas antes de reverter qualquer coisa.
- Reverte ambas na mesma transação, com o mesmo motivo, marcando os espelhos com o mesmo `swap_operation_id`.
- Idempotente: se as pernas já têm `reversed_at`, retorna sucesso sem criar espelho novo.
- `ReverterMovimentacaoDialog`, ao detectar um SWAP, avisa "esta reversão desfará as duas pernas do swap" e chama o wrapper.

Swaps legados continuam reversíveis pelo caminho atual, agora com aviso de perna irmã pendente.

### Etapa 3 — UX: fluxo em duas telas dentro do mesmo diálogo

Passo 1 (configuração) — o formulário atual, com melhorias:
- Mostrar proprietário e endereço junto de cada wallet selecionada.
- Alerta inline quando origem e destino forem a mesma wallet ou o mesmo endereço.
- Alerta reforçado quando os proprietários forem diferentes.
- Validação de compatibilidade coin × rede via `isWalletCompatibleWithCoin`.

Passo 2 (revisão e confirmação) — nova tela antes de gravar:

```text
REVISE SEU SWAP

ORIGEM                          DESTINO
Tiago (proprietário)            Tiago (proprietário)
Carteira: principal bitcoin     Carteira: principal bitcoin
Endereço: bc1q5j...z2fh         Endereço: bc1q5j...z2fh
BTC 0,03372300                  USDT 2.169,00
≈ $2.314,54                     ≈ $2.314,54

[banner] Mesma carteira: a conversão ocorrerá dentro da própria carteira.
[ ] Confirmei que a carteira de destino está correta.
                              [Voltar]  [Confirmar Swap]
```

O banner varia por cenário: mesma carteira (informativo), carteira diferente (atenção), proprietário diferente (alerta forte). O botão só habilita com o checkbox marcado. A criação automática de wallet aparece explicitada nessa tela ("Será criada uma nova wallet <rede> para receber <coin>").

### Etapa 4 — Histórico e auditoria

- Linha da tabela: substituir o "Swap Interno" genérico por `Proprietário • BTC → USDT`, com nome da carteira de origem e destino nas duas pernas (hoje cada perna resolve só um dos lados).
- Badge `REVERTIDO` passa a indicar também "swap revertido (2 pernas)".
- Novo drawer de detalhes do swap com: tipo, status, data/hora, usuário executor, proprietário/carteira/endereço/ativo/valor de cada lado, cotações usadas, IDs da operação, ID da operação original e do estorno, motivo e autor da reversão.

### Etapa 5 — Testes

- Swap mesma carteira e entre carteiras: saldos por coin batem antes/depois.
- Falha simulada na segunda perna: nada é gravado (atomicidade).
- Reversão a partir de qualquer perna desfaz as duas; saldo volta ao estado inicial.
- Reversão repetida não duplica espelhos.
- Swap revertido não impacta Caixa Operacional, Exposição Crypto nem KPIs.
- Swaps legados continuam reversíveis.

## Observação sobre a arquitetura V6

O swap é neutro para lucro: as duas pernas têm o mesmo `valor_usd` e o tipo está classificado como neutro em `ledgerNature.ts`, então não entra em resultado — apenas na composição de saldo por coin. As mudanças propostas não alteram esse comportamento; garantem apenas que as duas pernas nasçam e morram juntas.