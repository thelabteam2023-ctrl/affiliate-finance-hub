---
name: Reversal Chain Integrity Guard
description: Reversões de cash_ledger são bloqueadas quando deixariam saldo negativo em qualquer ativo (wallet, conta bancária, bookmaker)
type: feature
---
## Guard de Integridade de Cadeia na Reversão

`fn_ledger_reversal_impact(p_transacao_id)` é a fonte canônica: simula o saldo pós-reversão do ativo de DESTINO (wallet por coin, conta bancária, bookmaker) e lista as saídas posteriores daquele ativo.

`reverter_movimentacao_caixa` (wrapper) chama esse impacto ANTES de delegar para `reverter_movimentacao_caixa_inner`. Se qualquer ativo ficaria negativo (tolerância 0,01) → retorna `success:false, code:'CADEIA_DEPENDENTE'`.

`get_movimentacao_dependencies` também retorna `impacto` e enxerga descendentes por wallet/conta bancária, não só por bookmaker.

### Causa raiz histórica (01/08/2026, workspace André)
O guard antigo só disparava quando `COALESCE(destino_bookmaker_id, origem_bookmaker_id)` não era nulo. Transferência Caixa → carteira de parceiro tinha bookmaker NULL → reversão passou mesmo com depósito descendente de 120 USDT, deixando a carteira em −116,99.

### Regra
- Reversão nunca pode deixar saldo negativo. Reverter sempre em ordem cronológica inversa.
- Reparo de cadeia quebrada: nunca apagar linhas; usar `AJUSTE_RECONCILIACAO` com descrição `REPARO DE CADEIA:` citando os IDs envolvidos.
