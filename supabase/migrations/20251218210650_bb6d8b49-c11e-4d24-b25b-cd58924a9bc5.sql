-- Drop existing functions to allow return type changes
DROP FUNCTION IF EXISTS public.admin_get_all_users();
DROP FUNCTION IF EXISTS public.admin_get_all_workspaces();

-- Recreate admin_get_all_workspaces with explicit column qualifiers
CREATE OR REPLACE FUNCTION public.admin_get_all_workspaces()
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  plan text,
  is_active boolean,
  created_at timestamp with time zone,
  deactivated_at timestamp with time zone,
  deactivation_reason text,
  owner_id uuid,
  owner_name text,
  owner_email text,
  member_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if caller is system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;
  
  RETURN QUERY
  SELECT 
    w.id,
    w.name,
    w.slug,
    w.plan,
    COALESCE(w.is_active, true) as is_active,
    w.created_at,
    w.deactivated_at,
    w.deactivation_reason,
    owner_member.user_id as owner_id,
    owner_profile.full_name as owner_name,
    owner_profile.email as owner_email,
    (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id AND workspace_members.is_active = true) as member_count
  FROM workspaces w
  LEFT JOIN workspace_members owner_member ON w.id = owner_member.workspace_id AND owner_member.role = 'owner'
  LEFT JOIN profiles owner_profile ON owner_member.user_id = owner_profile.id
  ORDER BY w.created_at DESC;
END;
$$;

-- Recreate admin_get_all_users with is_system_owner column
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  created_at timestamp with time zone,
  is_blocked boolean,
  blocked_at timestamp with time zone,
  blocked_reason text,
  workspace_id uuid,
  workspace_name text,
  workspace_role app_role,
  is_system_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if caller is system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.created_at,
    COALESCE(p.is_blocked, false) as is_blocked,
    p.blocked_at,
    p.blocked_reason,
    wm.workspace_id,
    w.name as workspace_name,
    wm.role as workspace_role,
    COALESCE(p.is_system_owner, false) as is_system_owner
  FROM profiles p
  LEFT JOIN workspace_members wm ON p.id = wm.user_id AND wm.is_active = true
  LEFT JOIN workspaces w ON wm.workspace_id = w.id
  ORDER BY p.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_all_users() IS 'Returns all users with their workspace info and system owner status. Only accessible by system owners.';
COMMENT ON FUNCTION public.admin_get_all_workspaces() IS 'Returns all workspaces with owner info and member count. Only accessible by system owners.';