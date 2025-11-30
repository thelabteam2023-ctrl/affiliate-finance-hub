-- Adicionar coluna parceiro_id para vincular bookmaker ao parceiro
ALTER TABLE public.bookmakers 
ADD COLUMN IF NOT EXISTS parceiro_id UUID REFERENCES public.parceiros(id) ON DELETE CASCADE;