-- Add operador_id column to cash_ledger for direct operator payment traceability
ALTER TABLE public.cash_ledger
ADD COLUMN operador_id uuid REFERENCES public.operadores(id) ON DELETE SET NULL;

-- Create index for performance on operator payment queries
CREATE INDEX idx_cash_ledger_operador_id ON public.cash_ledger(operador_id) WHERE operador_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.cash_ledger.operador_id IS 'Reference to the operator when tipo_transacao is PAGTO_OPERADOR for direct traceability';