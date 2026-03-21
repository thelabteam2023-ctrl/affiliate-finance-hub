# Memory: architecture/ajuste-saldo-trigger-fix-v1
Updated: 2026-03-21

## Bug Crítico Corrigido: AJUSTE_SALDO não gerava financial_events

### Causa Raiz
O trigger `fn_cash_ledger_generate_financial_events` NÃO tinha um bloco handler para `tipo_transacao = 'AJUSTE_SALDO'`. Tratava `AJUSTE_MANUAL` e `AJUSTE_RECONCILIACAO`, mas ignorava `AJUSTE_SALDO`. O trigger marcava `financial_events_generated = TRUE` sem criar nenhum evento.

### Sintoma
Casas zeradas via AJUSTE_SALDO continuavam com saldo, pois o débito nunca era materializado nos financial_events → saldo nunca debitado pelo trigger de sync.

### Correção
1. Adicionado handler `AJUSTE_SALDO` ao trigger com idempotency_key `ledger_ajuste_saldo_{id}`
2. Adicionado handler `PERDA_OPERACIONAL` ao trigger
3. Gerados financial_events retroativos para todos AJUSTE_SALDO existentes
4. Recalculados todos os saldos de bookmakers

### Regra de Ouro
Todo novo `tipo_transacao` adicionado ao `cash_ledger` DEVE ter um handler correspondente em `fn_cash_ledger_generate_financial_events`. Sem isso, o saldo nunca será atualizado.
