DROP POLICY IF EXISTS planning_ips_select ON public.planning_ips;
DROP POLICY IF EXISTS planning_ips_insert ON public.planning_ips;
DROP POLICY IF EXISTS planning_ips_update ON public.planning_ips;
DROP POLICY IF EXISTS planning_ips_delete ON public.planning_ips;

CREATE POLICY planning_ips_select
ON public.planning_ips
FOR SELECT
TO authenticated
USING (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY planning_ips_insert
ON public.planning_ips
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_active_workspace_member(auth.uid(), workspace_id)
  AND created_by = auth.uid()
);

CREATE POLICY planning_ips_update
ON public.planning_ips
FOR UPDATE
TO authenticated
USING (public.is_active_workspace_member(auth.uid(), workspace_id))
WITH CHECK (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY planning_ips_delete
ON public.planning_ips
FOR DELETE
TO authenticated
USING (public.is_active_workspace_member(auth.uid(), workspace_id));