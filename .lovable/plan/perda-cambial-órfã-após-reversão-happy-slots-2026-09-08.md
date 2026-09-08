# Perda cambial órfã após reversão — Happy Slots

## O que foi confirmado agora (dados reais, não hipótese)

**A casa**
- HAPPY SLOTS · moeda USD · saldo atual **US$ 0,00** (já regularizado)
- Espaço de trabalho: **LABBET**
- Parceiro titular: **STHEFANI PEREIRA DOS SANTOS**
- Projeto vinculado: **MARCIO** (vínculo único — não há exposição compartilhada entre projetos)

**Os quatro lançamentos ligados ao incidente**

| Lançamento | Competência | Registro | Valor | Situação |
|---|---|---|---|---|
| Saque ETH 0,219679 (o verdadeiro) | 27/08 | 08/09 00:23 | US$ 559 | Confirmado |
| Saque USDC 546,78 (duplicado) | 07/09 | 08/09 00:23 | US$ 559 | **Cancelado e estornado** |
| Perda cambial 0,005411 ETH (filha do saque verdadeiro) | **07/09** | 08/09 00:24 | — | Confirmada |
| Perda cambial 12,22 USDC (filha do saque duplicado) | 07/09 | 08/09 00:23 | — | **Confirmada — órfã** |

**As duas falhas confirmadas**

1. **Reversão incompleta.** A perda cambial nasce como um lançamento próprio, ligado ao saque que a originou (há rastreabilidade, o vínculo existe). Mas a rotina de reverter/excluir uma movimentação só trata o par de um swap — ela nunca procura os lançamentos filhos. Resultado: o saque duplicado foi anulado e a perda de 12,22 USDC continuou no extrato do projeto MARCIO, como se o saque ainda existisse.
2. **Data errada na perda cambial.** A perda herda a data do dia em que a confirmação foi feita, não a data de competência do saque que a gerou. Por isso a perda do saque de 27/08 aparece em 07/09 no extrato. Em lançamento retroativo isso joga custo de um mês para o outro.

## O que vou fazer

### 1. Reversão em cadeia (a correção estrutural)
Reverter ou excluir uma movimentação passa a arrastar junto os lançamentos derivados dela (perda e ganho cambial), na mesma operação, tudo ou nada:
- ao reverter, cada filho gera seu próprio lançamento espelho, com o mesmo motivo e a referência ao pai;
- ao excluir dentro da janela de 30 minutos, os filhos são excluídos junto, com snapshot no log de auditoria;
- reverter duas vezes não duplica nada (a segunda vez não encontra filho ativo);
- a tela de confirmação passa a listar os filhos que serão arrastados, para a pessoa ver antes de confirmar.

### 2. Data de competência correta
A perda/ganho cambial passa a nascer com a mesma data de competência do saque que a originou, e não com a data de hoje. Corrijo também a perda de 0,005411 ETH já existente (07/09 → 27/08).

### 3. Limpeza do caso atual
- Anular a perda cambial órfã de 12,22 USDC do saque duplicado, com o motivo registrado no histórico (sem apagar nada).
- Manter a perda de 0,005411 ETH, que é real — apenas com a data corrigida.
- Reconferir depois: saldo da casa, saldo do parceiro, saldo da carteira e o extrato do projeto MARCIO.

### 4. Auditoria de integridade cambial
Uma consulta de varredura que aponta, em todo o sistema:
- perdas/ganhos cambiais cujo lançamento de origem foi revertido, cancelado ou não existe mais;
- perdas cambiais duplicadas para o mesmo lançamento;
- perdas cambiais com data de competência divergente do lançamento de origem;
- perdas cambiais sem projeto quando o pai tem projeto.

Entrego o resultado dessa varredura como relatório para você decidir caso a caso — não corrijo nada em massa sem sua autorização.

### 5. Testes de regressão
Testes automáticos cobrindo: reverter saque com perda cambial derivada; saque retroativo; reverter duas vezes seguidas (sem duplicar); saque em Ethereum com conversão para dólar; e a data de competência herdada corretamente.

## Detalhes técnicos

- Perdas/ganhos cambiais são linhas em `cash_ledger` com `tipo_transacao IN ('PERDA_CAMBIAL','GANHO_CAMBIAL')` e `referencia_transacao_id` = id do saque pai. Criadas em `ConfirmarSaqueDialog.tsx` (ramos cripto ~linha 319 e fiat ~linha 382), com `data_transacao: getTodayCivilDate()` — origem da divergência de competência.
- `reverter_movimentacao_caixa` monta `v_legs` apenas para `SWAP_IN/SWAP_OUT`; `excluir_movimentacao_caixa` idem. Nenhuma das duas varre filhos por `referencia_transacao_id`. Correção: nova função `fn_ledger_derived_children(uuid)` retornando os filhos cambiais ativos, consumida por ambas as rotinas e também por `get_movimentacao_dependencies` (para exibição prévia) e por `fn_ledger_reversal_impact`.
- `ConfirmarSaqueDialog.tsx` passa a usar `saque.data_transacao` como `data_transacao` do lançamento derivado.
- Ordem de reversão: filhos primeiro, pai depois, na mesma transação SQL, para não disparar o guard de saldo negativo em ordem errada.
- Correções de dados pontuais (perda órfã 12,22 USDC e data da perda ETH) por comando de dados, não por migração.
- Varredura de auditoria entregue como consulta + página de leitura reaproveitando o padrão de `LedgerAnomalies.tsx`.
