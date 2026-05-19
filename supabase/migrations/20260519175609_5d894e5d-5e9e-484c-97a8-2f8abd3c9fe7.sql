-- Adicionar coluna categoria na tabela fluxo_cards
ALTER TABLE public.fluxo_cards 
ADD COLUMN IF NOT EXISTS categoria TEXT;

-- Adicionar coluna categoria na tabela fluxo_cards_historico
ALTER TABLE public.fluxo_cards_historico 
ADD COLUMN IF NOT EXISTS categoria TEXT;
