-- Add nome_investidor field to cash_ledger for tracking investor names
ALTER TABLE public.cash_ledger 
ADD COLUMN nome_investidor TEXT;