-- Função para hard delete de usuários já anonimizados
-- Remove permanentemente de profiles e auth.users
CREATE OR REPLACE FUNCTION public.admin_hard_delete_users(_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count_profiles integer;
  v_count_auth integer;
  v_non_anonymized uuid[];
BEGIN
  -- Verificar se caller é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  -- Não permitir deletar o próprio usuário
  IF auth.uid() = ANY(_user_ids) THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Verificar se há usuários não anonimizados na lista
  SELECT ARRAY_AGG(id) INTO v_non_anonymized
  FROM profiles
  WHERE id = ANY(_user_ids)
    AND email NOT LIKE '%@removed.local';

  IF v_non_anonymized IS NOT NULL AND array_length(v_non_anonymized, 1) > 0 THEN
    RAISE EXCEPTION 'Só é possível fazer hard delete de usuários já anonimizados. Usuários não anonimizados: %', v_non_anonymized;
  END IF;

  -- Registrar operação no audit_log ANTES de deletar
  INSERT INTO audit_logs (workspace_id, actor_user_id, action, entity_type, entity_name, metadata)
  VALUES (
    get_user_workspace(auth.uid()),
    auth.uid(),
    'DELETE',
    'hard_delete_users',
    'Exclusão permanente de usuários',
    jsonb_build_object(
      'user_ids', _user_ids,
      'phase', 'executed'
    )
  );

  -- Deletar de profiles primeiro
  DELETE FROM profiles WHERE id = ANY(_user_ids);
  GET DIAGNOSTICS v_count_profiles = ROW_COUNT;

  -- Deletar de auth.users
  DELETE FROM auth.users WHERE id = ANY(_user_ids);
  GET DIAGNOSTICS v_count_auth = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_profiles', v_count_profiles,
    'deleted_auth_users', v_count_auth
  );
END;
$$;

-- Função para listar usuários arquivados (já anonimizados)
CREATE OR REPLACE FUNCTION public.admin_get_archived_users()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verificar se caller é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.created_at
  FROM profiles p
  WHERE p.email LIKE '%@removed.local'
  ORDER BY p.created_at DESC;
END;
$$;