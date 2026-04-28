ALTER TABLE public.planning_ips
ADD COLUMN IF NOT EXISTS bookmaker_catalogo_id UUID REFERENCES public.bookmakers_catalogo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_planning_ips_bookmaker_catalogo
ON public.planning_ips(bookmaker_catalogo_id);