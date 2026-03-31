
-- Add operador_id to despesas_administrativas for linking RH expenses to operators
ALTER TABLE public.despesas_administrativas 
ADD COLUMN operador_id UUID REFERENCES public.operadores(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX idx_despesas_admin_operador ON public.despesas_administrativas(operador_id) WHERE operador_id IS NOT NULL;

-- Also add operador_id to cash_ledger auditoria_metadata is already JSON, but let's ensure
-- the cash_ledger description includes the operator name for traceability
COMMENT ON COLUMN public.despesas_administrativas.operador_id IS 'Operador vinculado a despesas de RH (Recursos Humanos)';
