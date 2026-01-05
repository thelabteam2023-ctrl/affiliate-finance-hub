-- Corrigir funções RPC: entity_id é UUID, usar NULL para ações de sistema

CREATE OR REPLACE FUNCTION public.force_relogin_global()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected_count INTEGER;
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_admin_id AND is_system_owner = true
  ) THEN
    RAISE EXCEPTION 'Apenas System Owner pode executar esta ação';
  END IF;
  
  UPDATE profiles 
  SET auth_version = auth_version + 1,
      updated_at = now()
  WHERE id != v_admin_id;
  
  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  
  INSERT INTO audit_logs (
    actor_user_id, 
    action, 
    entity_type, 
    entity_id,
    entity_name,
    metadata
  ) VALUES (
    v_admin_id,
    'UPDATE',
    'system',
    NULL,
    'force_relogin_global',
    jsonb_build_object(
      'action', 'force_relogin_global',
      'affected_users', v_affected_count,
      'timestamp', now()
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'affected_users', v_affected_count,
    'message', 'Todos os usuários precisarão fazer login novamente'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.force_relogin_workspace(p_workspace_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected_count INTEGER;
  v_admin_id UUID;
  v_workspace_name TEXT;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_admin_id AND is_system_owner = true
  ) AND NOT EXISTS (
    SELECT 1 FROM workspace_members 
    WHERE user_id = v_admin_id 
    AND workspace_id = p_workspace_id 
    AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Sem permissão para esta ação';
  END IF;
  
  SELECT name INTO v_workspace_name FROM workspaces WHERE id = p_workspace_id;
  
  UPDATE workspace_members 
  SET auth_version = auth_version + 1
  WHERE workspace_id = p_workspace_id
  AND user_id != v_admin_id;
  
  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  
  INSERT INTO audit_logs (
    actor_user_id, 
    action, 
    entity_type, 
    entity_id,
    entity_name,
    metadata,
    workspace_id
  ) VALUES (
    v_admin_id,
    'UPDATE',
    'workspace',
    p_workspace_id,
    v_workspace_name,
    jsonb_build_object(
      'action', 'force_relogin_workspace',
      'workspace_name', v_workspace_name,
      'affected_members', v_affected_count
    ),
    p_workspace_id
  );
  
  RETURN json_build_object(
    'success', true,
    'affected_members', v_affected_count,
    'workspace_name', v_workspace_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.force_relogin_user(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_user_email TEXT;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_admin_id AND is_system_owner = true
  ) THEN
    RAISE EXCEPTION 'Apenas System Owner pode executar esta ação';
  END IF;
  
  IF p_user_id = v_admin_id THEN
    RAISE EXCEPTION 'Não é possível forçar relogin de si mesmo';
  END IF;
  
  SELECT email INTO v_user_email FROM profiles WHERE id = p_user_id;
  
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;
  
  UPDATE profiles 
  SET auth_version = auth_version + 1,
      updated_at = now()
  WHERE id = p_user_id;
  
  INSERT INTO audit_logs (
    actor_user_id, 
    action, 
    entity_type, 
    entity_id,
    entity_name,
    metadata
  ) VALUES (
    v_admin_id,
    'UPDATE',
    'user',
    p_user_id,
    v_user_email,
    jsonb_build_object(
      'action', 'force_relogin_user',
      'target_email', v_user_email
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'user_email', v_user_email,
    'message', 'Usuário precisará fazer login novamente'
  );
END;
$$;