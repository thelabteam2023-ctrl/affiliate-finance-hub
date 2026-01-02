
-- Update get_my_pending_invites to include inviter name
DROP FUNCTION IF EXISTS public.get_my_pending_invites();

CREATE OR REPLACE FUNCTION public.get_my_pending_invites()
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  role text,
  token uuid,
  expires_at timestamptz,
  inviter_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_email text;
BEGIN
  -- Get the current user's email
  SELECT email INTO _user_email
  FROM auth.users
  WHERE auth.users.id = auth.uid();
  
  IF _user_email IS NULL THEN
    RETURN;
  END IF;
  
  -- Return pending invites for this email with inviter information
  RETURN QUERY
  SELECT 
    wi.id,
    wi.workspace_id,
    w.name AS workspace_name,
    w.slug AS workspace_slug,
    wi.role::text,
    wi.token,
    wi.expires_at,
    p.full_name AS inviter_name
  FROM workspace_invites wi
  JOIN workspaces w ON w.id = wi.workspace_id
  LEFT JOIN profiles p ON p.id = wi.created_by
  WHERE wi.email = _user_email
    AND wi.status = 'pending'
    AND wi.expires_at > now();
END;
$$;
