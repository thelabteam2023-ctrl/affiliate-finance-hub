
-- Create workspace-scoped admin check
CREATE OR REPLACE FUNCTION public.user_is_owner_or_admin_in_workspace(check_user_id uuid, check_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_system_owner(check_user_id)
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.user_id = check_user_id
        AND wm.workspace_id = check_workspace_id
        AND wm.is_active = true
        AND wm.role IN ('owner', 'admin')
    )
$$;

-- Fix chat messages moderation policy
DROP POLICY IF EXISTS "Authors or admins can update messages" ON community_chat_messages;
CREATE POLICY "Authors or admins can update messages"
ON community_chat_messages FOR UPDATE TO authenticated
USING (
  (user_id = auth.uid()) 
  OR public.user_is_owner_or_admin_in_workspace(auth.uid(), workspace_id)
)
WITH CHECK (
  (user_id = auth.uid()) 
  OR public.user_is_owner_or_admin_in_workspace(auth.uid(), workspace_id)
);
