
-- Add sub_motivo column to ocorrencias table
ALTER TABLE public.ocorrencias 
ADD COLUMN IF NOT EXISTS sub_motivo text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.ocorrencias.sub_motivo IS 'Sub-motivo dinâmico baseado no tipo da ocorrência (ex: kyc_pendente, provedor_atrasado, etc.)';
