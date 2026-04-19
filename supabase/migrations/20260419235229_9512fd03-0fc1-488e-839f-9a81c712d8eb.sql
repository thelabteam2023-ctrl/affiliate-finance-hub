
-- Permitir perfis genéricos: parceiro_id pode ser nulo, mais nome livre + cor
ALTER TABLE public.planning_perfis
  ALTER COLUMN parceiro_id DROP NOT NULL;

ALTER TABLE public.planning_perfis
  ADD COLUMN IF NOT EXISTS cor text NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS nome_generico text;

-- Drop the old unique constraint that doesn't make sense for null parceiros
ALTER TABLE public.planning_perfis
  DROP CONSTRAINT IF EXISTS planning_perfis_workspace_id_parceiro_id_key;

-- Re-create as partial unique index (only when parceiro_id is set)
CREATE UNIQUE INDEX IF NOT EXISTS planning_perfis_ws_parceiro_unique
  ON public.planning_perfis (workspace_id, parceiro_id)
  WHERE parceiro_id IS NOT NULL;

-- Validation: precisa ter parceiro_id OU nome_generico
ALTER TABLE public.planning_perfis
  DROP CONSTRAINT IF EXISTS planning_perfis_identidade_check;

ALTER TABLE public.planning_perfis
  ADD CONSTRAINT planning_perfis_identidade_check
  CHECK (parceiro_id IS NOT NULL OR (nome_generico IS NOT NULL AND length(trim(nome_generico)) > 0));
