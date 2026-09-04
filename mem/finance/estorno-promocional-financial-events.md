---
name: Estorno Promocional gera Financial Event
description: BONUS_ESTORNO, CASHBACK_ESTORNO e GIRO_GRATIS_ESTORNO devem gerar financial_events negativos na origem
type: feature
---

`fn_cash_ledger_generate_financial_events` possui ramificação dedicada para estornos promocionais
(`BONUS_ESTORNO`, `CASHBACK_ESTORNO`, `GIRO_GRATIS_ESTORNO`): evento negativo na
`origem_bookmaker_id`, chaves de idempotência canônicas `ledger_bonus_estorno_<id>`,
`ledger_cashback_estorno_<id>`, `ledger_giro_estorno_<id>`.

Sem essa ramificação o estorno é gravado no `cash_ledger` mas o saldo da bookmaker NÃO é debitado
(o saldo só muda via `fn_financial_events_sync_balance`). Regressão real: GASTON RED manteve US$ 100
após exclusão de bônus creditado (04/09/2026). Ao reescrever essa função, preservar sempre este bloco.

Freebet segue caminho próprio (`estornarFreebetViaLedger` → `processFinancialEvent` FREEBET_EXPIRE) e
não depende do ledger.
