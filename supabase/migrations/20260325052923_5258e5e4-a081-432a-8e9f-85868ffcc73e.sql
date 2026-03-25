
-- Helper: check whether a user is owner/admin of a workspace without depending on row-level visibility
CREATE OR REPLACE FUNCTION public.can_manage_workspace(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_system_owner(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = _workspace_id
        AND wm.user_id = _user_id
        AND wm.is_active = true
        AND wm.role IN ('owner', 'admin')
    )
$$;

-- Replace child workspace creation policy to use the security definer helper
DROP POLICY IF EXISTS "Members can create child workspaces" ON public.workspaces;

CREATE POLICY "Members can create child workspaces"
ON public.workspaces
FOR INSERT
TO authenticated
WITH CHECK (
  parent_workspace_id IS NOT NULL
  AND public.can_manage_workspace(auth.uid(), parent_workspace_id)
);

-- Allow the creator to seed the initial owner membership in a newly created child workspace
CREATE POLICY "Owners can seed child workspace membership"
ON public.workspace_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'owner'
  AND EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = workspace_members.workspace_id
      AND w.parent_workspace_id IS NOT NULL
      AND public.can_manage_workspace(auth.uid(), w.parent_workspace_id)
  )
);
