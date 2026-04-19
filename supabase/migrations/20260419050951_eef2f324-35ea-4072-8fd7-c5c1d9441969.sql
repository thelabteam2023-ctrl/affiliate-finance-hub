ALTER TABLE public.planning_campanhas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planning_campanhas_select ON public.planning_campanhas;
DROP POLICY IF EXISTS planning_campanhas_insert ON public.planning_campanhas;
DROP POLICY IF EXISTS planning_campanhas_update ON public.planning_campanhas;
DROP POLICY IF EXISTS planning_campanhas_delete ON public.planning_campanhas;

CREATE POLICY planning_campanhas_select
ON public.planning_campanhas
FOR SELECT
TO authenticated
USING (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY planning_campanhas_insert
ON public.planning_campanhas
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_active_workspace_member(auth.uid(), workspace_id)
  AND created_by = auth.uid()
);

CREATE POLICY planning_campanhas_update
ON public.planning_campanhas
FOR UPDATE
TO authenticated
USING (public.is_active_workspace_member(auth.uid(), workspace_id))
WITH CHECK (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY planning_campanhas_delete
ON public.planning_campanhas
FOR DELETE
TO authenticated
USING (public.is_active_workspace_member(auth.uid(), workspace_id));