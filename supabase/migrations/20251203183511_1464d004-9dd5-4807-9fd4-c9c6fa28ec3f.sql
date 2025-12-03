-- Add base_calculo column to investidor_deals
ALTER TABLE public.investidor_deals 
ADD COLUMN base_calculo TEXT NOT NULL DEFAULT 'LUCRO';

-- Add comment for documentation
COMMENT ON COLUMN public.investidor_deals.base_calculo IS 'Base de cálculo: LUCRO (sobre lucros) ou APORTE (sobre valor aportado)';