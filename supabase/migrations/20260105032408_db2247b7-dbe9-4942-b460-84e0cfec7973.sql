-- REFATORAÇÃO SEGURA: Versionamento de Sessão (Session Versioning)
-- Remove dependência do schema auth e usa controle na aplicação

-- 1. Adicionar auth_version no profiles (controle global por usuário)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;

-- 2. Adicionar auth_version no workspace_members (controle por workspace)
ALTER TABLE public.workspace_members 
ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;

-- 3. Criar função para incrementar auth_version globalmente (todos os usuários)
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
  -- Pegar o admin que está executando
  v_admin_id := auth.uid();
  
  -- Verificar se é system owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_admin_id AND is_system_owner = true
  ) THEN
    RAISE EXCEPTION 'Apenas System Owner pode executar esta ação';
  END IF;
  
  -- Incrementar auth_version de TODOS os usuários EXCETO o admin
  UPDATE profiles 
  SET auth_version = auth_version + 1,
      updated_at = now()
  WHERE id != v_admin_id;
  
  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  
  -- Log na auditoria
  INSERT INTO audit_logs (
    actor_user_id, 
    action, 
    entity_type, 
    entity_id,
    metadata
  ) VALUES (
    v_admin_id,
    'update',
    'system',
    'global_relogin',
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

-- 4. Criar função para incrementar auth_version por workspace
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
  
  -- Verificar se é system owner ou owner do workspace
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
  
  -- Pegar nome do workspace
  SELECT name INTO v_workspace_name FROM workspaces WHERE id = p_workspace_id;
  
  -- Incrementar auth_version dos membros do workspace EXCETO o admin
  UPDATE workspace_members 
  SET auth_version = auth_version + 1
  WHERE workspace_id = p_workspace_id
  AND user_id != v_admin_id;
  
  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  
  -- Log
  INSERT INTO audit_logs (
    actor_user_id, 
    action, 
    entity_type, 
    entity_id,
    metadata,
    workspace_id
  ) VALUES (
    v_admin_id,
    'update',
    'workspace',
    p_workspace_id::text,
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

-- 5. Criar função para incrementar auth_version de um usuário específico
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
  
  -- Verificar se é system owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_admin_id AND is_system_owner = true
  ) THEN
    RAISE EXCEPTION 'Apenas System Owner pode executar esta ação';
  END IF;
  
  -- Não pode forçar relogin de si mesmo
  IF p_user_id = v_admin_id THEN
    RAISE EXCEPTION 'Não é possível forçar relogin de si mesmo';
  END IF;
  
  -- Pegar email do usuário
  SELECT email INTO v_user_email FROM profiles WHERE id = p_user_id;
  
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;
  
  -- Incrementar auth_version do usuário
  UPDATE profiles 
  SET auth_version = auth_version + 1,
      updated_at = now()
  WHERE id = p_user_id;
  
  -- Log
  INSERT INTO audit_logs (
    actor_user_id, 
    action, 
    entity_type, 
    entity_id,
    metadata
  ) VALUES (
    v_admin_id,
    'update',
    'user',
    p_user_id::text,
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

-- 6. Criar função para buscar auth_version do usuário (para o guard verificar)
CREATE OR REPLACE FUNCTION public.get_user_auth_version(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version INTEGER;
BEGIN
  SELECT auth_version INTO v_version 
  FROM profiles 
  WHERE id = p_user_id;
  
  RETURN COALESCE(v_version, 1);
END;
$$;

-- 7. Função para buscar auth_version do workspace member
CREATE OR REPLACE FUNCTION public.get_workspace_auth_version(p_user_id UUID, p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version INTEGER;
BEGIN
  SELECT auth_version INTO v_version 
  FROM workspace_members 
  WHERE user_id = p_user_id 
  AND workspace_id = p_workspace_id;
  
  RETURN COALESCE(v_version, 1);
END;
$$;

-- 8. REMOVER a função antiga que manipulava auth.* (se existir)
DROP FUNCTION IF EXISTS public.admin_force_global_logout(UUID);

-- 9. Garantir permissões
GRANT EXECUTE ON FUNCTION public.force_relogin_global() TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_relogin_workspace(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_relogin_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_auth_version(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_auth_version(UUID, UUID) TO authenticated;