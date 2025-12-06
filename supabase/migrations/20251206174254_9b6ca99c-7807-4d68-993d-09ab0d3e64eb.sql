-- Add back commission field for exchange bets
ALTER TABLE public.apostas 
ADD COLUMN IF NOT EXISTS back_em_exchange BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS back_comissao NUMERIC DEFAULT 0;