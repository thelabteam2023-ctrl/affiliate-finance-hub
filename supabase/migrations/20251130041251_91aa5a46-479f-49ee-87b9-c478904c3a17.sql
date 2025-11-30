-- Adicionar colunas para vincular bookmaker ao catálogo
ALTER TABLE public.bookmakers 
ADD COLUMN IF NOT EXISTS bookmaker_catalogo_id UUID REFERENCES public.bookmakers_catalogo(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS link_origem TEXT;