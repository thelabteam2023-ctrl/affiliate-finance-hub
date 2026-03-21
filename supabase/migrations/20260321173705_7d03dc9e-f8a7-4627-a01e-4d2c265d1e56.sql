
-- Fix: DEPOSITO_VIRTUAL entries in broker projects lost events during reprocessing.
-- Reset flag so trigger regenerates the DEPOSITO event.

UPDATE public.cash_ledger
SET financial_events_generated = FALSE,
    balance_processed_at = NULL
WHERE id = '8aaac095-3205-410f-8ce2-fcd679a8eceb'
  AND tipo_transacao = 'DEPOSITO_VIRTUAL'
  AND financial_events_generated = TRUE;

-- Force re-trigger by touching status to fire the BEFORE UPDATE trigger
UPDATE public.cash_ledger
SET status = 'CONFIRMADO',
    updated_at = NOW()
WHERE id = '8aaac095-3205-410f-8ce2-fcd679a8eceb'
  AND tipo_transacao = 'DEPOSITO_VIRTUAL';
