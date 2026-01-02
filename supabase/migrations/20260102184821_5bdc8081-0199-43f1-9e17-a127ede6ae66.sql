
-- First drop the existing function, then recreate with fixed column references
DROP FUNCTION IF EXISTS public.get_my_pending_invites();

-- Recreate the function with explicit table aliases to avoid ambiguous column reference
CREATE OR REPLACE FUNCTION public.get_my_pending_invites()
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  role text,
  token uuid,
  expires_at timestamptz
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
  
  -- Return pending invites for this email with explicit table aliases
  RETURN QUERY
  SELECT 
    wi.id,
    wi.workspace_id,
    w.name AS workspace_name,
    w.slug AS workspace_slug,
    wi.role::text,
    wi.token,
    wi.expires_at
  FROM workspace_invites wi
  JOIN workspaces w ON w.id = wi.workspace_id
  WHERE wi.email = _user_email
    AND wi.status = 'pending'
    AND wi.expires_at > now();
END;
$$;
