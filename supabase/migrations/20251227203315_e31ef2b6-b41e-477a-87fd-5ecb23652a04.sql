-- =====================================================
-- EXPIRAÇÃO DE SESSÃO POR INATIVIDADE (40 MINUTOS)
-- =====================================================

-- 1. Adicionar coluna last_activity_at para rastrear atividade
ALTER TABLE public.login_history 
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Atualizar sessões existentes ativas com valor inicial
UPDATE public.login_history
SET last_activity_at = COALESCE(login_at, NOW())
WHERE last_activity_at IS NULL;

-- 2. Função para atualizar atividade do usuário
-- Chamada quando há atividade humana real
CREATE OR REPLACE FUNCTION public.update_user_activity(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.login_history
  SET last_activity_at = NOW()
  WHERE user_id = p_user_id 
    AND is_active = true 
    AND session_status = 'active';
  
  RETURN FOUND;
END;
$$;

-- 3. Função para verificar e expirar sessões inativas
-- Retorna sessões que foram expiradas
CREATE OR REPLACE FUNCTION public.check_session_inactivity(
  p_user_id UUID,
  p_timeout_minutes INTEGER DEFAULT 40
)
RETURNS TABLE(
  session_id UUID,
  was_expired BOOLEAN,
  last_activity TIMESTAMP WITH TIME ZONE,
  minutes_inactive NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_activity TIMESTAMP WITH TIME ZONE;
  v_minutes_inactive NUMERIC;
  v_session_id UUID;
BEGIN
  -- Buscar sessão ativa do usuário
  SELECT id, last_activity_at 
  INTO v_session_id, v_last_activity
  FROM public.login_history
  WHERE user_id = p_user_id 
    AND is_active = true 
    AND session_status = 'active'
  ORDER BY login_at DESC
  LIMIT 1;
  
  -- Se não há sessão ativa, retornar vazio
  IF v_session_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Calcular minutos de inatividade
  v_minutes_inactive := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_last_activity, NOW()))) / 60;
  
  -- Se passou do timeout, expirar sessão
  IF v_minutes_inactive >= p_timeout_minutes THEN
    UPDATE public.login_history
    SET 
      is_active = false,
      logout_at = NOW(),
      session_status = 'expired'
    WHERE id = v_session_id;
    
    RETURN QUERY SELECT v_session_id, true, v_last_activity, v_minutes_inactive;
  ELSE
    RETURN QUERY SELECT v_session_id, false, v_last_activity, v_minutes_inactive;
  END IF;
END;
$$;

-- 4. Função para expirar sessão por inatividade (chamada pelo cliente)
CREATE OR REPLACE FUNCTION public.expire_session_by_inactivity(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE public.login_history
  SET 
    is_active = false,
    logout_at = NOW(),
    session_status = 'expired'
  WHERE user_id = p_user_id 
    AND (is_active = true OR session_status = 'active');
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  
  RETURN affected_count;
END;
$$;

-- 5. Atualizar secure_login para definir last_activity_at
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

  -- PASSO 2: Criar nova sessão limpa com last_activity_at
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

  RETURN new_session_id;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.update_user_activity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_session_inactivity(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_session_by_inactivity(UUID) TO authenticated;