
-- RPC to fetch workspaces in a group with owner info (for System Owner only)
CREATE OR REPLACE FUNCTION public.admin_get_group_workspaces(p_group_id uuid)
RETURNS TABLE (
  id uuid,
  group_id uuid,
  workspace_id uuid,
  added_at timestamptz,
  added_by uuid,
  workspace_name text,
  workspace_plan text,
  owner_user_id uuid,
  owner_email text,
  owner_public_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security check: only system owners can call this
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System Owner only';
  END IF;

  RETURN QUERY
  SELECT 
    agw.id,
    agw.group_id,
    agw.workspace_id,
    agw.added_at,
    agw.added_by,
    w.name as workspace_name,
    w.plan as workspace_plan,
    wm.user_id as owner_user_id,
    p.email as owner_email,
    p.public_id::text as owner_public_id
  FROM access_group_workspaces agw
  JOIN workspaces w ON w.id = agw.workspace_id
  LEFT JOIN workspace_members wm ON wm.workspace_id = agw.workspace_id AND wm.role = 'owner'
  LEFT JOIN profiles p ON p.id = wm.user_id
  WHERE agw.group_id = p_group_id
  ORDER BY w.name;
END;
$$;
