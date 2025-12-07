-- Adicionar campo para armazenar o tipo de freebet na operação de cobertura
ALTER TABLE public.apostas 
ADD COLUMN IF NOT EXISTS tipo_freebet text DEFAULT NULL;

-- Comentário para documentação
COMMENT ON COLUMN public.apostas.tipo_freebet IS 'Tipo de freebet para operações de cobertura: normal, freebet_snr, freebet_sr';