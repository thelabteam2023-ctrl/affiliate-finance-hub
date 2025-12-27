
-- Drop and recreate admin_get_all_users with last_login field
DROP FUNCTION IF EXISTS public.admin_get_all_users(boolean);

CREATE OR REPLACE FUNCTION public.admin_get_all_users(_include_deleted boolean DEFAULT false)
 RETURNS TABLE(
   id uuid, 
   email text, 
   full_name text, 
   public_id character varying, 
   created_at timestamp with time zone, 
   is_blocked boolean, 
   blocked_at timestamp with time zone, 
   blocked_reason text, 
   workspace_id uuid, 
   workspace_name text, 
   workspace_role app_role, 
   is_system_owner boolean, 
   is_deleted boolean,
   last_login timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    p.public_id,
    p.created_at,
    COALESCE(p.is_blocked, false) as is_blocked,
    p.blocked_at,
    p.blocked_reason,
    wm.workspace_id,
    w.name as workspace_name,
    wm.role as workspace_role,
    COALESCE(p.is_system_owner, false) as is_system_owner,
    (p.email LIKE '%@removed.local') as is_deleted,
    (
      SELECT MAX(lh.login_at) 
      FROM login_history lh 
      WHERE lh.user_id = p.id
    ) as last_login
  FROM profiles p
  LEFT JOIN workspace_members wm ON p.id = wm.user_id AND wm.is_active = true
  LEFT JOIN workspaces w ON wm.workspace_id = w.id
  WHERE 
    (_include_deleted = true OR p.email NOT LIKE '%@removed.local')
  ORDER BY p.created_at DESC;
END;
$function$;
