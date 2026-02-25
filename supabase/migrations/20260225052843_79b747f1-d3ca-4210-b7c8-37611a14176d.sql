-- Harden workspace_members: restrict to authenticated role only
DROP POLICY IF EXISTS "View workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Owner/Admin manage members" ON public.workspace_members;

CREATE POLICY "View workspace members" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (workspace_id = get_user_workspace(auth.uid()));

CREATE POLICY "Owner/Admin manage members" ON public.workspace_members
  FOR ALL TO authenticated
  USING (is_owner_or_admin(auth.uid(), workspace_id))
  WITH CHECK (is_owner_or_admin(auth.uid(), workspace_id));