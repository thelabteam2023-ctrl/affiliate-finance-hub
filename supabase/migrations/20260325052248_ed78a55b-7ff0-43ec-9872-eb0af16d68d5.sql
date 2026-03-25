-- Allow workspace owners/admins to create child workspaces (supplier portals)
CREATE POLICY "Members can create child workspaces"
ON public.workspaces
FOR INSERT
TO authenticated
WITH CHECK (
  -- System owners can always create
  public.is_system_owner(auth.uid())
  OR
  -- Members of the parent workspace can create child workspaces
  (parent_workspace_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = parent_workspace_id
    AND wm.user_id = auth.uid()
    AND wm.is_active = true
  ))
);