-- Add moeda_destino column to track the currency used in reconciliation
ALTER TABLE public.exchange_adjustments 
ADD COLUMN moeda_destino text DEFAULT 'USD';

-- Add comment for documentation
COMMENT ON COLUMN public.exchange_adjustments.moeda_destino IS 'The destination currency of the reconciled transaction (e.g., EUR, USD, BRL)';