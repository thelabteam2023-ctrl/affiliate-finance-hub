-- Enums for grupo de regras
CREATE TYPE public.grupo_regra_tipo AS ENUM (
  'LIMITE_MAX_POR_PERFIL',
  'UNICA_POR_PERFIL',
  'IP_UNICO_OBRIGATORIO',
  'COOLDOWN_DIAS'
);

CREATE TYPE public.grupo_regra_escopo AS ENUM (
  'PERFIL',
  'IP',
  'CARTEIRA',
  'WORKSPACE'
);

CREATE TYPE public.grupo_regra_severidade AS ENUM (
  'BLOQUEIO',
  'AVISO'
);

-- Tabela de regras
CREATE TABLE public.bookmaker_grupo_regras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  grupo_id UUID NOT NULL REFERENCES public.bookmaker_grupos(id) ON DELETE CASCADE,
  tipo_regra public.grupo_regra_tipo NOT NULL,
  escopo public.grupo_regra_escopo NOT NULL DEFAULT 'PERFIL',
  severidade public.grupo_regra_severidade NOT NULL DEFAULT 'BLOQUEIO',
  valor_numerico NUMERIC,
  mensagem_violacao TEXT,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookmaker_grupo_regras_grupo ON public.bookmaker_grupo_regras(grupo_id);
CREATE INDEX idx_bookmaker_grupo_regras_workspace ON public.bookmaker_grupo_regras(workspace_id);

ALTER TABLE public.bookmaker_grupo_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY bookmaker_grupo_regras_select ON public.bookmaker_grupo_regras
  FOR SELECT TO authenticated
  USING (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY bookmaker_grupo_regras_insert ON public.bookmaker_grupo_regras
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_workspace_member(auth.uid(), workspace_id)
    AND created_by = auth.uid()
  );

CREATE POLICY bookmaker_grupo_regras_update ON public.bookmaker_grupo_regras
  FOR UPDATE TO authenticated
  USING (public.is_active_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY bookmaker_grupo_regras_delete ON public.bookmaker_grupo_regras
  FOR DELETE TO authenticated
  USING (public.is_active_workspace_member(auth.uid(), workspace_id));

-- Trigger updated_at
CREATE TRIGGER trg_bookmaker_grupo_regras_updated_at
  BEFORE UPDATE ON public.bookmaker_grupo_regras
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();