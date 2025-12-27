-- =====================================================
-- SEGURANÇA DE SESSÕES: MIGRAÇÃO COMPLETA
-- Objetivo: Eliminar estados inconsistentes de sessão
-- =====================================================

-- 1. Dropar função antiga para permitir mudança de retorno
DROP FUNCTION IF EXISTS public.end_user_session(UUID);

-- 2. Função melhorada para encerrar sessão do usuário
-- Retorna número de sessões encerradas para feedback
CREATE FUNCTION public.end_user_session(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  -- Encerrar TODAS as sessões ativas do usuário de forma atômica
  UPDATE public.login_history
  SET 
    is_active = false,
    logout_at = NOW(),
    session_status = 'closed'
  WHERE user_id = p_user_id 
    AND (is_active = true OR session_status = 'active');
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  
  RETURN affected_count;
END;
$$;

-- 3. Função para criar sessão de login de forma segura
-- Encerra todas as sessões anteriores antes de criar nova
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
  -- Isso garante que não haverá sessões fantasmas
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

  -- PASSO 2: Criar nova sessão limpa
  INSERT INTO public.login_history (
    user_id,
    user_email,
    user_name,
    workspace_id,
    workspace_name,
    ip_address,
    user_agent,
    login_at,
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
    true,
    'active'
  )
  RETURNING id INTO new_session_id;

  RETURN new_session_id;
END;
$$;

-- 4. Função para cleanup de sessões órfãs
CREATE OR REPLACE FUNCTION public.cleanup_orphan_sessions(p_hours_threshold INTEGER DEFAULT 24)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  -- Marcar como expired sessões ativas sem atividade por mais de X horas
  UPDATE public.login_history
  SET 
    is_active = false,
    session_status = 'expired',
    logout_at = NOW()
  WHERE is_active = true
    AND session_status = 'active'
    AND login_at < NOW() - (p_hours_threshold || ' hours')::INTERVAL;
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  
  RETURN affected_count;
END;
$$;

-- 5. Limpar dados antigos inconsistentes agora
-- Corrigir sessões que estão como 'active' mas não têm presença há muito tempo
UPDATE public.login_history
SET 
  is_active = false,
  session_status = 'expired',
  logout_at = COALESCE(logout_at, NOW())
WHERE is_active = true
  AND session_status = 'active'
  AND login_at < NOW() - INTERVAL '24 hours';

-- 6. Garantir consistência: se tem logout_at, não pode estar ativo
UPDATE public.login_history
SET 
  is_active = false,
  session_status = CASE 
    WHEN session_status = 'active' THEN 'closed'
    ELSE session_status
  END
WHERE logout_at IS NOT NULL 
  AND (is_active = true OR session_status = 'active');

-- Grants
GRANT EXECUTE ON FUNCTION public.end_user_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.secure_login(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_sessions(INTEGER) TO authenticated;