CREATE TABLE IF NOT EXISTS public.planning_casas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bookmaker_catalogo_id uuid NOT NULL REFERENCES public.bookmakers_catalogo(id) ON DELETE CASCADE,
  label_custom text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planning_casas_unique UNIQUE (workspace_id, bookmaker_catalogo_id)
);

CREATE INDEX IF NOT EXISTS idx_planning_casas_workspace ON public.planning_casas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_planning_casas_bookmaker ON public.planning_casas(bookmaker_catalogo_id);

ALTER TABLE public.planning_casas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planning_casas_select"
ON public.planning_casas FOR SELECT TO authenticated
USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "planning_casas_insert"
ON public.planning_casas FOR INSERT TO authenticated
WITH CHECK (public.is_active_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid());

CREATE POLICY "planning_casas_update"
ON public.planning_casas FOR UPDATE TO authenticated
USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "planning_casas_delete"
ON public.planning_casas FOR DELETE TO authenticated
USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_planning_casas_updated_at
BEFORE UPDATE ON public.planning_casas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();