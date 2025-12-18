-- Add system owner flag and blocked status to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_system_owner boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS blocked_reason text;

-- Add status to workspaces
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS deactivated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS deactivation_reason text;

-- Function to check if user is system owner (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.is_system_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_system_owner FROM profiles WHERE id = _user_id),
    false
  )
$$;

-- Function to get all users (for system admin only)
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  is_blocked boolean,
  blocked_at timestamptz,
  blocked_reason text,
  workspace_id uuid,
  workspace_name text,
  workspace_role app_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    wm.role as workspace_role
  FROM profiles p
  LEFT JOIN workspace_members wm ON p.id = wm.user_id AND wm.is_active = true
  LEFT JOIN workspaces w ON wm.workspace_id = w.id
  ORDER BY p.created_at DESC;
END;
$$;

-- Function to get all workspaces (for system admin only)
CREATE OR REPLACE FUNCTION public.admin_get_all_workspaces()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  plan text,
  is_active boolean,
  created_at timestamptz,
  deactivated_at timestamptz,
  deactivation_reason text,
  owner_id uuid,
  owner_name text,
  owner_email text,
  member_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id AND is_active = true) as member_count
  FROM workspaces w
  LEFT JOIN workspace_members owner_member ON w.id = owner_member.workspace_id AND owner_member.role = 'owner'
  LEFT JOIN profiles owner_profile ON owner_member.user_id = owner_profile.id
  ORDER BY w.created_at DESC;
END;
$$;

-- Function to create workspace for a user (system admin only)
CREATE OR REPLACE FUNCTION public.admin_create_workspace_for_user(
  _user_id uuid,
  _workspace_name text,
  _plan text DEFAULT 'free',
  _role app_role DEFAULT 'owner'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _workspace_id uuid;
  _slug text;
BEGIN
  -- Check if caller is system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;
  
  -- Generate slug
  _slug := lower(regexp_replace(_workspace_name, '[^a-zA-Z0-9]+', '-', 'g'));
  _slug := _slug || '-' || substr(gen_random_uuid()::text, 1, 8);
  
  -- Create workspace
  INSERT INTO workspaces (name, slug, plan, is_active)
  VALUES (_workspace_name, _slug, _plan, true)
  RETURNING id INTO _workspace_id;
  
  -- Add user as member
  INSERT INTO workspace_members (workspace_id, user_id, role, is_active, joined_at)
  VALUES (_workspace_id, _user_id, _role, true, now());
  
  RETURN _workspace_id;
END;
$$;

-- Function to add user to existing workspace (system admin only)
CREATE OR REPLACE FUNCTION public.admin_add_user_to_workspace(
  _user_id uuid,
  _workspace_id uuid,
  _role app_role DEFAULT 'user'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;
  
  -- Check if already member
  IF EXISTS (SELECT 1 FROM workspace_members WHERE user_id = _user_id AND workspace_id = _workspace_id) THEN
    -- Update existing membership
    UPDATE workspace_members 
    SET role = _role, is_active = true, joined_at = COALESCE(joined_at, now())
    WHERE user_id = _user_id AND workspace_id = _workspace_id;
  ELSE
    -- Add new membership
    INSERT INTO workspace_members (workspace_id, user_id, role, is_active, joined_at)
    VALUES (_workspace_id, _user_id, _role, true, now());
  END IF;
END;
$$;

-- Function to block/unblock user (system admin only)
CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(
  _user_id uuid,
  _blocked boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;
  
  -- Cannot block system owner
  IF is_system_owner(_user_id) THEN
    RAISE EXCEPTION 'Cannot block system owner';
  END IF;
  
  UPDATE profiles 
  SET 
    is_blocked = _blocked,
    blocked_at = CASE WHEN _blocked THEN now() ELSE NULL END,
    blocked_reason = CASE WHEN _blocked THEN _reason ELSE NULL END
  WHERE id = _user_id;
END;
$$;

-- Function to update workspace plan (system admin only)
CREATE OR REPLACE FUNCTION public.admin_update_workspace_plan(
  _workspace_id uuid,
  _plan text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _max_partners integer;
  _max_users integer;
BEGIN
  -- Check if caller is system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;
  
  -- Set limits based on plan
  CASE _plan
    WHEN 'free' THEN _max_partners := 3; _max_users := 1;
    WHEN 'starter' THEN _max_partners := 15; _max_users := 3;
    WHEN 'pro' THEN _max_partners := 50; _max_users := 10;
    WHEN 'advanced' THEN _max_partners := -1; _max_users := -1; -- unlimited
    ELSE _max_partners := 3; _max_users := 1;
  END CASE;
  
  UPDATE workspaces 
  SET plan = _plan, max_active_partners = _max_partners, max_users = _max_users
  WHERE id = _workspace_id;
END;
$$;

-- Function to activate/deactivate workspace (system admin only)
CREATE OR REPLACE FUNCTION public.admin_set_workspace_active(
  _workspace_id uuid,
  _active boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;
  
  UPDATE workspaces 
  SET 
    is_active = _active,
    deactivated_at = CASE WHEN NOT _active THEN now() ELSE NULL END,
    deactivation_reason = CASE WHEN NOT _active THEN _reason ELSE NULL END
  WHERE id = _workspace_id;
END;
$$;

-- Function to get workspace members (system admin only)
CREATE OR REPLACE FUNCTION public.admin_get_workspace_members(_workspace_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  role app_role,
  is_active boolean,
  joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;
  
  RETURN QUERY
  SELECT 
    wm.user_id,
    p.email,
    p.full_name,
    wm.role,
    wm.is_active,
    wm.joined_at
  FROM workspace_members wm
  JOIN profiles p ON wm.user_id = p.id
  WHERE wm.workspace_id = _workspace_id
  ORDER BY wm.role, p.full_name;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_system_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_workspaces() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_workspace_for_user(uuid, text, text, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_user_to_workspace(uuid, uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_blocked(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_workspace_plan(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_workspace_active(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_workspace_members(uuid) TO authenticated;