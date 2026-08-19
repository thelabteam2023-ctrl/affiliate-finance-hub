# Swap Interno: valores ambíguos na revisão + erro de workspace_id

## O que foi verificado

**Erro "column w.workspace_id does not exist"** — causa raiz confirmada: a RPC `fn_registrar_swap_crypto` valida as wallets com
`FROM wallets_crypto w WHERE ... AND w.workspace_id = p_workspace_id`, mas a tabela `wallets_crypto` **não tem** coluna `workspace_id`
(colunas: id, parceiro_id, rede_id, endereco, label, exchange, network, moeda, balance_locked, ...). O workspace da carteira é herdado
via `parceiros.workspace_id`. O `workspace_id` enviado pelo frontend está correto — o erro é 100% dentro da função SQL.

**Os dois números na tela de revisão** — causa raiz confirmada em `SwapCryptoDialog.tsx`:
- `2.169 USDT` = `qtdRecebida`, digitada pelo usuário. É exatamente o valor gravado em `qtd_coin` da perna SWAP_IN e o que credita a carteira de destino.
- `2.308,16` = `usdEnviado` = `qtdEnviada × preço BTC` — o valor **em dólar** do BTC debitado. Na linha 614 o card de DESTINO imprime
  `usdEnviado` (deveria ser `usdRecebido`), e o rótulo é só "≈ $", o que ao lado de "USDT" lê como se fossem 2.308,16 USDT.
- **Não existe taxa** no modelo: a diferença ($2.308,16 debitado vs ≈$2.169 recebido, −6,02%) é o *spread* da conversão feita na exchange,
  já calculado no passo 1 do formulário mas escondido no passo de revisão.
- O backend reforça a ambiguidade: a RPC grava `valor_usd = qtd_origem × preço_origem` nas **duas** pernas ("swap é zero-sum"), então um
  swap com spread real registra o lado recebido por um USD que não corresponde a `2.169 USDT`.

Rastreabilidade atual: `qtdRecebida` (input) → `p_qtd_destino` → `cash_ledger.qtd_coin` (SWAP_IN) → saldo por coin em
`v_saldo_parceiro_wallets`. Esse caminho está correto; só a apresentação e o `valor_usd` da perna IN estão errados.

## Correções

### 1. RPC `fn_registrar_swap_crypto` (migração)
- Trocar as duas validações de wallet por join com `parceiros`:
  `wallets_crypto w JOIN parceiros p ON p.id = w.parceiro_id WHERE w.id = ... AND w.parceiro_id = p_parceiro_id AND p.workspace_id = p_workspace_id`.
- Adicionar validação de que o usuário pertence ao workspace informado (membro de `workspace_members` ou owner), rejeitando `workspace_id`
  manipulado pelo frontend — a função é SECURITY DEFINER e hoje aceita qualquer workspace.
- Rejeitar `p_workspace_id`/`p_parceiro_id` nulos com mensagem explícita.
- Gravar `valor_usd` **por perna**: OUT = `qtd_origem × preço_origem`; IN = `qtd_destino × preço_destino`. Manter `valor_usd_referencia`
  igual ao valor econômico da origem nas duas pernas (base de auditoria/zero-sum) e registrar em `auditoria_metadata` o spread
  (`usd_origem`, `usd_destino`, `spread_usd`, `spread_pct`) para o histórico.
- `DROP FUNCTION IF EXISTS` antes de recriar, conforme padrão do projeto.

### 2. Tela de revisão sem ambiguidade (`SwapCryptoDialog.tsx`)
- Card DESTINO: `≈ US$ {usdRecebido}` (corrige o uso de `usdEnviado`) e linha destacada **"Valor que será creditado: 2.169 USDT"**.
- Card ORIGEM: **"Valor debitado: 0,033723 BTC"** com `≈ US$ {usdEnviado}`.
- Bloco "Detalhes da conversão" entre os cards, explícito:
  cotação BTC, cotação USDT, taxa implícita (1 BTC = X USDT), valor econômico enviado (US$), valor econômico recebido (US$),
  e **Spread / custo da conversão** em US$ e %, com aviso quando o spread for negativo além de um limiar (ex.: −2%): "esta conversão
  reduz o valor econômico em US$ X (−Y%). Confirme se os valores estão corretos."
- Todo valor em dólar passa a ser rotulado `US$` (nunca só `$` colado a um card de USDT).
- Deixar explícito que o sistema não cobra taxa própria: o que existe é o spread entre o valor enviado e o recebido.
- Manter os banners de mesma carteira × carteira diferente e o checkbox obrigatório.

### 3. Guardas de workspace no frontend
- Bloquear o submit (com mensagem clara, sem fallback arbitrário) quando `workspaceId` ou `caixaParceiroId` estiverem ausentes; hoje o
  handler apenas retorna em silêncio.
- Manter o `workspaceId` vindo do contexto canônico da aba (`useWorkspace`/`useTabWorkspace`), sem valor fixo.

### 4. Histórico
- Exibir no detalhe do swap: debitado (coin + US$), creditado (coin + US$) e spread, usando o `valor_usd` agora correto por perna.

## Testes
1. Swap mesma carteira BTC → USDT: revisão mostra 0,033723 BTC / US$ 2.308,16 debitado e 2.169 USDT / ≈US$ 2.169 creditado, spread −6,02%; após confirmar, `qtd_coin` do SWAP_IN = 2169 e o saldo USDT sobe exatamente 2169.
2. Swap entre carteiras diferentes do mesmo parceiro: sucesso, banner de atenção exibido.
3. Confirmação com workspace ausente: bloqueada no frontend e, forçando a chamada, rejeitada pela RPC.
4. Chamada com `p_workspace_id` de outro workspace ou wallet de outro parceiro: rejeitada.
5. Reversão do swap: as duas pernas revertidas juntas, saldos BTC e USDT voltam ao estado inicial, sem evento órfão ou duplicado.
6. Swaps legados (sem `swap_operation_id`) continuam reversíveis.
7. `supabase--linter` limpo e typecheck sem erros.
