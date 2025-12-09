-- Adicionar campo mercado à tabela surebets
ALTER TABLE public.surebets ADD COLUMN IF NOT EXISTS mercado text;