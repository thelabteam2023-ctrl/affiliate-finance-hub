-- Drop and recreate admin_get_login_history with new return type
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
    is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if caller is system admin
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
        COALESCE(lh.is_active, false) as is_active
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

-- Update the end functions with search_path for security
CREATE OR REPLACE FUNCTION end_previous_sessions()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.login_history
  SET 
    is_active = false,
    logout_at = NOW()
  WHERE user_id = NEW.user_id 
    AND id != NEW.id 
    AND is_active = true;
  
  NEW.is_active := true;
  RETURN NEW;
END;
$$;

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
    logout_at = NOW()
  WHERE user_id = p_user_id 
    AND is_active = true;
END;
$$;