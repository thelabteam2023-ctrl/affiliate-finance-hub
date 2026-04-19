-- Fix RLS policies on planning_perfis: argument order was reversed
-- Function signature: is_active_workspace_member(_user_id uuid, _workspace_id uuid)

DROP POLICY IF EXISTS planning_perfis_select ON public.planning_perfis;
DROP POLICY IF EXISTS planning_perfis_insert ON public.planning_perfis;
DROP POLICY IF EXISTS planning_perfis_update ON public.planning_perfis;
DROP POLICY IF EXISTS planning_perfis_delete ON public.planning_perfis;

CREATE POLICY planning_perfis_select ON public.planning_perfis
  FOR SELECT TO authenticated
  USING (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY planning_perfis_insert ON public.planning_perfis
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_workspace_member(auth.uid(), workspace_id)
    AND created_by = auth.uid()
  );

CREATE POLICY planning_perfis_update ON public.planning_perfis
  FOR UPDATE TO authenticated
  USING (public.is_active_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY planning_perfis_delete ON public.planning_perfis
  FOR DELETE TO authenticated
  USING (public.is_active_workspace_member(auth.uid(), workspace_id));