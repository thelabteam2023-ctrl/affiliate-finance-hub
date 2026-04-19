DROP POLICY IF EXISTS "planning_casas_select" ON public.planning_casas;
DROP POLICY IF EXISTS "planning_casas_insert" ON public.planning_casas;
DROP POLICY IF EXISTS "planning_casas_update" ON public.planning_casas;
DROP POLICY IF EXISTS "planning_casas_delete" ON public.planning_casas;

CREATE POLICY "planning_casas_select"
ON public.planning_casas FOR SELECT TO authenticated
USING (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "planning_casas_insert"
ON public.planning_casas FOR INSERT TO authenticated
WITH CHECK (public.is_active_workspace_member(auth.uid(), workspace_id) AND created_by = auth.uid());

CREATE POLICY "planning_casas_update"
ON public.planning_casas FOR UPDATE TO authenticated
USING (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "planning_casas_delete"
ON public.planning_casas FOR DELETE TO authenticated
USING (public.is_active_workspace_member(auth.uid(), workspace_id));