-- Criar função para forçar logout global (com acesso ao schema auth)
CREATE OR REPLACE FUNCTION public.admin_force_global_logout(p_admin_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sessions_deleted INTEGER := 0;
  refresh_deleted INTEGER := 0;
  history_updated INTEGER := 0;
BEGIN
  -- Deletar refresh_tokens de todos os usuários exceto o admin
  DELETE FROM auth.refresh_tokens 
  WHERE user_id != p_admin_user_id;
  GET DIAGNOSTICS refresh_deleted = ROW_COUNT;

  -- Deletar sessions de todos os usuários exceto o admin
  DELETE FROM auth.sessions 
  WHERE user_id != p_admin_user_id;
  GET DIAGNOSTICS sessions_deleted = ROW_COUNT;

  -- Atualizar login_history
  UPDATE public.login_history
  SET 
    is_active = false,
    logout_at = NOW(),
    session_status = 'force_logout'
  WHERE is_active = true 
    AND user_id != p_admin_user_id;
  GET DIAGNOSTICS history_updated = ROW_COUNT;

  RETURN json_build_object(
    'sessions_deleted', sessions_deleted,
    'refresh_tokens_deleted', refresh_deleted,
    'login_history_updated', history_updated
  );
END;
$$;