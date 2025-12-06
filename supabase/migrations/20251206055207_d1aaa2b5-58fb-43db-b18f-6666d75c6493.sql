-- Drop existing constraint
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_status_check;

-- Add updated constraint with RECUSADO included
ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_status_check 
CHECK (status IN ('PENDENTE', 'CONFIRMADO', 'CANCELADO', 'RECUSADO'));