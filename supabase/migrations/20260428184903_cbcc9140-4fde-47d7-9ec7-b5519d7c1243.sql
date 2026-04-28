ALTER TABLE public.planning_ips
ADD COLUMN IF NOT EXISTS perfil_planejamento_id UUID REFERENCES public.planning_perfis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_planning_ips_perfil_bookmaker
ON public.planning_ips(perfil_planejamento_id, bookmaker_catalogo_id);