-- Add session_status column for explicit session state
ALTER TABLE login_history ADD COLUMN IF NOT EXISTS session_status TEXT DEFAULT 'active' CHECK (session_status IN ('active', 'closed', 'expired'));

-- Update existing records: if is_active=false, mark as closed
UPDATE login_history SET session_status = 'closed' WHERE is_active = false;
UPDATE login_history SET session_status = 'active' WHERE is_active = true;

-- Update the trigger to set session_status properly
CREATE OR REPLACE FUNCTION end_previous_sessions()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark all previous active sessions for this user as closed
  UPDATE public.login_history
  SET 
    is_active = false,
    logout_at = NOW(),
    session_status = 'closed'
  WHERE user_id = NEW.user_id 
    AND id != NEW.id 
    AND is_active = true;
  
  -- New session starts as active
  NEW.is_active := true;
  NEW.session_status := 'active';
  
  RETURN NEW;
END;
$$;

-- Update the logout function
CREATE OR REPLACE FUNCTION end_user_session(p_user_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.login_history
  SET 
    is_active = false,
    logout_at = NOW(),
    session_status = 'closed'
  WHERE user_id = p_user_id 
    AND is_active = true;
END;
$$;

-- Update RPC function to return session_status
DROP FUNCTION IF EXISTS admin_get_login_history(integer, integer, uuid, uuid, timestamptz, timestamptz);

CREATE FUNCTION admin_get_login_history(
    _limit integer DEFAULT 100,
    _offset integer DEFAULT 0,
    _workspace_id uuid DEFAULT NULL,
    _user_id uuid DEFAULT NULL,
    _start_date timestamptz DEFAULT NULL,
    _end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    user_email text,
    user_name text,
    workspace_id uuid,
    workspace_name text,
    ip_address text,
    user_agent text,
    login_at timestamptz,
    logout_at timestamptz,
    is_active boolean,
    session_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_system_owner(auth.uid()) THEN
        RAISE EXCEPTION 'Acesso negado: apenas administradores do sistema';
    END IF;
    
    RETURN QUERY
    SELECT 
        lh.id,
        lh.user_id,
        lh.user_email,
        lh.user_name,
        lh.workspace_id,
        lh.workspace_name,
        lh.ip_address,
        lh.user_agent,
        lh.login_at,
        lh.logout_at,
        COALESCE(lh.is_active, false) as is_active,
        COALESCE(lh.session_status, 'closed') as session_status
    FROM public.login_history lh
    WHERE 
        (_workspace_id IS NULL OR lh.workspace_id = _workspace_id)
        AND (_user_id IS NULL OR lh.user_id = _user_id)
        AND (_start_date IS NULL OR lh.login_at >= _start_date)
        AND (_end_date IS NULL OR lh.login_at <= _end_date)
    ORDER BY lh.login_at DESC
    LIMIT _limit
    OFFSET _offset;
END;
$$;