---
name: Swap Crypto Atomic Pair
description: Swap interno de carteiras nasce e morre em par — RPC atômica fn_registrar_swap_crypto e reversão conjunta das duas pernas
type: feature
---

## Registro

Todo swap interno é gravado por `fn_registrar_swap_crypto` (SECURITY DEFINER). Proibido inserir
`SWAP_OUT`/`SWAP_IN` direto do frontend.

- As duas pernas são inseridas na mesma transação e compartilham `cash_ledger.swap_operation_id`.
- A perna IN mantém `referencia_transacao_id` apontando para a OUT (compatibilidade com swaps legados).
- `valor_usd` é IGUAL nas duas pernas (`qtd_origem × preço_origem`): swap é zero-sum, não cria nem destrói valor.
- A RPC revalida no servidor: saldo da coin de origem, wallets do parceiro/workspace, coins diferentes, quantidades > 0.

## Reversão

`reverter_movimentacao_caixa` detecta swap e reverte **as duas pernas juntas**:
roda `fn_ledger_reversal_impact` em todas antes de reverter qualquer uma; qualquer bloqueio aborta tudo.
Reverter apenas metade de um swap é proibido.

## UI

`SwapCryptoDialog` tem duas etapas: configuração → revisão (proprietário, carteira, endereço, ativo e valor
dos dois lados) com checkbox de confirmação obrigatório. Banner distingue mesma carteira × carteira diferente.
O histórico do Caixa resolve as duas pontas via perna irmã — nunca exibir o rótulo genérico "Swap Interno"
quando a wallet puder ser resolvida.