-- Criar RPC segura para alterar role de membro com validações
CREATE OR REPLACE FUNCTION public.change_member_role(
  _member_id UUID,
  _new_role app_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_target_user_id UUID;
  v_old_role app_role;
  v_actor_role app_role;
  v_owner_count INT;
  v_target_email TEXT;
  v_target_name TEXT;
BEGIN
  -- Buscar dados do membro alvo
  SELECT wm.workspace_id, wm.user_id, wm.role
  INTO v_workspace_id, v_target_user_id, v_old_role
  FROM workspace_members wm
  WHERE wm.id = _member_id;
  
  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Membro não encontrado');
  END IF;
  
  -- Buscar role do ator
  SELECT role INTO v_actor_role
  FROM workspace_members
  WHERE workspace_id = v_workspace_id AND user_id = auth.uid() AND is_active = true;
  
  -- Verificar permissão do ator (apenas owner pode promover para admin, apenas owner/admin pode alterar outros)
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para alterar roles');
  END IF;
  
  -- Admin não pode promover para owner ou admin
  IF v_actor_role = 'admin' AND _new_role IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas o proprietário pode promover para administrador');
  END IF;
  
  -- Não pode alterar o próprio role
  IF v_target_user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você não pode alterar seu próprio papel');
  END IF;
  
  -- Não pode alterar owner
  IF v_old_role = 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não é possível alterar o papel do proprietário');
  END IF;
  
  -- Não pode promover para owner (transferência de propriedade é outro fluxo)
  IF _new_role = 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transferência de propriedade não é permitida por este método');
  END IF;
  
  -- Se role é a mesma, não fazer nada
  IF v_old_role = _new_role THEN
    RETURN jsonb_build_object('success', true, 'message', 'Role já é a mesma');
  END IF;
  
  -- Buscar dados do alvo para auditoria
  SELECT email, full_name INTO v_target_email, v_target_name
  FROM profiles WHERE id = v_target_user_id;
  
  -- Executar a alteração
  UPDATE workspace_members
  SET role = _new_role, updated_at = now()
  WHERE id = _member_id;
  
  -- Registrar auditoria
  INSERT INTO audit_logs (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    entity_name,
    before_data,
    after_data,
    metadata
  ) VALUES (
    v_workspace_id,
    auth.uid(),
    'UPDATE',
    'workspace_member',
    _member_id,
    COALESCE(v_target_name, v_target_email),
    jsonb_build_object('role', v_old_role),
    jsonb_build_object('role', _new_role),
    jsonb_build_object(
      'target_user_id', v_target_user_id,
      'target_email', v_target_email,
      'is_escalation', _new_role = 'admin'
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'old_role', v_old_role,
    'new_role', _new_role,
    'target_user_id', v_target_user_id
  );
END;
$$;