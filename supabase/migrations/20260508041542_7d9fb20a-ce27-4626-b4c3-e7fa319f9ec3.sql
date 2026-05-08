-- Add new columns to planning_extras
ALTER TABLE public.planning_extras 
ADD COLUMN IF NOT EXISTS perfil_id UUID REFERENCES public.planning_perfis(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ip_id UUID REFERENCES public.planning_ips(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS plano_id UUID REFERENCES public.distribuicao_planos(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_planning_extras_perfil ON public.planning_extras(perfil_id);
CREATE INDEX IF NOT EXISTS idx_planning_extras_ip ON public.planning_extras(ip_id);
CREATE INDEX IF NOT EXISTS idx_planning_extras_plano ON public.planning_extras(plano_id);
