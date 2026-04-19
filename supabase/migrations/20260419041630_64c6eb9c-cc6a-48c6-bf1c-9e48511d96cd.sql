CREATE TABLE IF NOT EXISTS public.planning_perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parceiro_id uuid NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  label_custom text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, parceiro_id)
);

CREATE INDEX IF NOT EXISTS idx_planning_perfis_workspace ON public.planning_perfis(workspace_id);
CREATE INDEX IF NOT EXISTS idx_planning_perfis_parceiro ON public.planning_perfis(parceiro_id);

ALTER TABLE public.planning_perfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planning_perfis_select"
ON public.planning_perfis FOR SELECT
TO authenticated
USING (is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "planning_perfis_insert"
ON public.planning_perfis FOR INSERT
TO authenticated
WITH CHECK (
  is_active_workspace_member(workspace_id, auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "planning_perfis_update"
ON public.planning_perfis FOR UPDATE
TO authenticated
USING (is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "planning_perfis_delete"
ON public.planning_perfis FOR DELETE
TO authenticated
USING (is_active_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_planning_perfis_updated_at
BEFORE UPDATE ON public.planning_perfis
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
