
-- Fix ALL orphaned DEPOSITO_VIRTUAL and SAQUE_VIRTUAL entries across all workspaces
-- These had financial_events_generated=TRUE but events were deleted during reprocessing
-- and the old trigger didn't handle these types

-- Step 1: Reset flags for ALL orphaned DEPOSITO_VIRTUAL entries
UPDATE public.cash_ledger
SET financial_events_generated = FALSE,
    balance_processed_at = NULL
WHERE tipo_transacao IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL')
  AND status = 'CONFIRMADO'
  AND financial_events_generated = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_events fe 
    WHERE fe.idempotency_key = 'ledger_deposit_' || cash_ledger.id::text
       OR fe.idempotency_key = 'ledger_withdraw_' || cash_ledger.id::text
  );

-- Step 2: Re-trigger by touching updated_at (fires BEFORE UPDATE trigger)
UPDATE public.cash_ledger
SET updated_at = NOW()
WHERE tipo_transacao IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL')
  AND status = 'CONFIRMADO'
  AND financial_events_generated = FALSE;
