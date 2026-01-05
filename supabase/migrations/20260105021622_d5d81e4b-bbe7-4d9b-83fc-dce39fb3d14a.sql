
-- ============================================
-- CORREÇÃO ESTRUTURAL: SISTEMA DE LOGIN GLOBAL
-- ============================================

-- 1. ADICIONAR last_login_at na profiles (login GLOBAL do usuário)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- 2. ATUALIZAR last_login_at baseado em histórico existente
UPDATE public.profiles p
SET last_login_at = (
  SELECT MAX(lh.login_at)
  FROM public.login_history lh
  WHERE lh.user_id = p.id
)
WHERE p.last_login_at IS NULL;

-- 3. ATUALIZAR secure_login() para atualizar profiles.last_login_at
CREATE OR REPLACE FUNCTION public.secure_login(
  p_user_id UUID,
  p_user_email TEXT,
  p_user_name TEXT DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL,
  p_workspace_name TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_session_id UUID;
BEGIN
  -- PASSO 1: Encerrar TODAS as sessões anteriores do usuário
  UPDATE public.login_history
  SET 
    is_active = false,
    logout_at = COALESCE(logout_at, NOW()),
    session_status = CASE 
      WHEN session_status = 'active' THEN 'closed'
      ELSE session_status
    END
  WHERE user_id = p_user_id 
    AND (is_active = true OR session_status = 'active');

  -- PASSO 2: Criar nova sessão com workspace atual
  INSERT INTO public.login_history (
    user_id,
    user_email,
    user_name,
    workspace_id,
    workspace_name,
    ip_address,
    user_agent,
    login_at,
    last_activity_at,
    is_active,
    session_status
  ) VALUES (
    p_user_id,
    p_user_email,
    p_user_name,
    p_workspace_id,
    p_workspace_name,
    p_ip_address,
    p_user_agent,
    NOW(),
    NOW(),
    true,
    'active'
  )
  RETURNING id INTO new_session_id;

  -- PASSO 3: NOVO - Atualizar last_login_at GLOBAL no perfil
  UPDATE public.profiles
  SET last_login_at = NOW(),
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN new_session_id;
END;
$$;

-- 4. CRIAR VIEW para último login GLOBAL (independente de workspace)
CREATE OR REPLACE VIEW public.v_user_last_login AS
SELECT 
  p.id as user_id,
  p.email,
  p.full_name,
  p.last_login_at as last_login_global,
  p.is_system_owner,
  p.is_blocked,
  lh.login_at as last_session_at,
  lh.workspace_id as last_workspace_id,
  lh.workspace_name as last_workspace_name,
  lh.ip_address as last_ip_address,
  lh.is_active as session_is_active,
  lh.session_status
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT login_at, workspace_id, workspace_name, ip_address, is_active, session_status
  FROM public.login_history
  WHERE user_id = p.id
  ORDER BY login_at DESC
  LIMIT 1
) lh ON true;

-- 5. ATUALIZAR RPC admin_get_login_stats
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
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: requer privilégios de system owner';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE login_at >= CURRENT_DATE)::BIGINT as today_logins,
    COUNT(*) FILTER (WHERE login_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT as week_logins,
    COUNT(*) FILTER (WHERE login_at >= CURRENT_DATE - INTERVAL '30 days')::BIGINT as month_logins,
    COUNT(DISTINCT user_id) FILTER (WHERE login_at >= CURRENT_DATE)::BIGINT as unique_users_today,
    COUNT(DISTINCT user_id) FILTER (WHERE login_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT as unique_users_week
  FROM public.login_history;
END;
$$;

-- 6. DROPAR e RECRIAR admin_get_login_history com novo retorno
DROP FUNCTION IF EXISTS public.admin_get_login_history(INTEGER, INTEGER, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE FUNCTION public.admin_get_login_history(
  _limit INTEGER DEFAULT 100,
  _offset INTEGER DEFAULT 0,
  _workspace_id UUID DEFAULT NULL,
  _user_id UUID DEFAULT NULL,
  _start_date TIMESTAMPTZ DEFAULT NULL,
  _end_date TIMESTAMPTZ DEFAULT NULL
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
  login_at TIMESTAMPTZ,
  logout_at TIMESTAMPTZ,
  is_active BOOLEAN,
  session_status TEXT,
  last_login_global TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: requer privilégios de system owner';
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
    lh.is_active,
    lh.session_status,
    p.last_login_at as last_login_global
  FROM public.login_history lh
  LEFT JOIN public.profiles p ON p.id = lh.user_id
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

-- 7. CRIAR FUNÇÃO para obter usuários que NUNCA logaram
CREATE OR REPLACE FUNCTION public.admin_get_users_never_logged()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ,
  workspaces_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: requer privilégios de system owner';
  END IF;

  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.email,
    p.full_name,
    p.created_at,
    COUNT(DISTINCT wm.workspace_id)::BIGINT as workspaces_count
  FROM public.profiles p
  LEFT JOIN public.workspace_members wm ON wm.user_id = p.id AND wm.is_active = true
  WHERE p.last_login_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.login_history lh WHERE lh.user_id = p.id)
  GROUP BY p.id, p.email, p.full_name, p.created_at
  ORDER BY p.created_at DESC;
END;
$$;

-- 8. COMENTÁRIOS
COMMENT ON COLUMN public.profiles.last_login_at IS 
  'Último login GLOBAL do usuário (independente de workspace). Atualizado automaticamente pela função secure_login().';

COMMENT ON VIEW public.v_user_last_login IS 
  'View consolidada com último login global do usuário e detalhes da última sessão.';
