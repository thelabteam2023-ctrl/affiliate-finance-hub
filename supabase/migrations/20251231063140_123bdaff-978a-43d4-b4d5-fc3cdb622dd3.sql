-- Add cotacao_trabalho field to projetos table
-- This stores the working exchange rate used for bet calculations
ALTER TABLE public.projetos 
ADD COLUMN IF NOT EXISTS cotacao_trabalho numeric DEFAULT 5.30;

-- Add comment explaining the field
COMMENT ON COLUMN public.projetos.cotacao_trabalho IS 'Cotação de trabalho USD/BRL usada para cálculos operacionais. Apenas novas apostas usam este valor.';