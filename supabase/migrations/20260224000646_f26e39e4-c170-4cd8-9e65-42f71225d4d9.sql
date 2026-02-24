-- Add tipo_bonus column to differentiate BONUS vs FREEBET promotions
ALTER TABLE public.project_bookmaker_link_bonuses 
ADD COLUMN IF NOT EXISTS tipo_bonus TEXT NOT NULL DEFAULT 'BONUS' 
CHECK (tipo_bonus IN ('BONUS', 'FREEBET'));

-- Add comment for documentation
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.tipo_bonus IS 
'Tipo da promoção: BONUS (saldo bônus com rollover) ou FREEBET (uso único, só lucro retorna ao saldo real)';