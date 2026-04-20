-- 1) Remove a tabela de agenda automática (não é mais usada)
DROP TABLE IF EXISTS public.distribuicao_plano_agenda CASCADE;

-- 2) Marca células de distribuição que já foram agendadas no calendário
ALTER TABLE public.distribuicao_plano_celulas
  ADD COLUMN IF NOT EXISTS agendada_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS campanha_id uuid NULL REFERENCES public.planning_campanhas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dist_celulas_campanha ON public.distribuicao_plano_celulas(campanha_id);
CREATE INDEX IF NOT EXISTS idx_dist_celulas_agendada ON public.distribuicao_plano_celulas(plano_id, agendada_em);