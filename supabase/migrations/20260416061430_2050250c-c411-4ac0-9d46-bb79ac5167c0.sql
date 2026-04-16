ALTER TABLE public.project_bookmaker_link_bonuses
  ADD COLUMN IF NOT EXISTS valor_consolidado_snapshot numeric DEFAULT NULL;