-- Create table for login history tracking
CREATE TABLE public.login_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    user_email TEXT,
    user_name TEXT,
    workspace_id UUID,
    workspace_name TEXT,
    ip_address TEXT,
    user_agent TEXT,
    login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    session_id TEXT
);

-- Enable RLS
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- System admins can read all login history
CREATE POLICY "System admins can read login history"
ON public.login_history
FOR SELECT
USING (public.is_system_owner(auth.uid()));

-- Create index for faster queries
CREATE INDEX idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX idx_login_history_workspace_id ON public.login_history(workspace_id);
CREATE INDEX idx_login_history_login_at ON public.login_history(login_at DESC);

-- Admin function to get login history
CREATE OR REPLACE FUNCTION public.admin_get_login_history(
    _limit INTEGER DEFAULT 100,
    _offset INTEGER DEFAULT 0,
    _workspace_id UUID DEFAULT NULL,
    _user_id UUID DEFAULT NULL,
    _start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    _end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    user_email TEXT,
    user_name TEXT,
    workspace_id UUID,
    workspace_name TEXT,
    ip_address TEXT,
    user_agent TEXT,
    login_at TIMESTAMP WITH TIME ZONE
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
        lh.login_at
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

-- Admin function to get login stats
CREATE OR REPLACE FUNCTION public.admin_get_login_stats()
RETURNS TABLE (
    today_logins BIGINT,
    week_logins BIGINT,
    month_logins BIGINT,
    unique_users_today BIGINT,
    unique_users_week BIGINT
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
        (SELECT COUNT(*) FROM public.login_history WHERE login_at > now() - interval '1 day'),
        (SELECT COUNT(*) FROM public.login_history WHERE login_at > now() - interval '7 days'),
        (SELECT COUNT(*) FROM public.login_history WHERE login_at > now() - interval '30 days'),
        (SELECT COUNT(DISTINCT lh.user_id) FROM public.login_history lh WHERE lh.login_at > now() - interval '1 day'),
        (SELECT COUNT(DISTINCT lh.user_id) FROM public.login_history lh WHERE lh.login_at > now() - interval '7 days');
END;
$$;

-- Enable realtime for login_history
ALTER PUBLICATION supabase_realtime ADD TABLE public.login_history;