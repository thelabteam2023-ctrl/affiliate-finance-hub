-- RPC para retornar usuários elegíveis para vínculo em projetos
-- Baseado em permissões efetivas (role base + adicionais), não apenas role = operator

CREATE OR REPLACE FUNCTION public.get_project_operator_candidates(_workspace_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  cpf text,
  role_base text,
  eligible_by_role boolean,
  eligible_by_extra boolean,
  operador_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_user_id uuid := auth.uid();
  -- Permissões que tornam um usuário elegível para trabalhar em projetos
  _eligible_permissions text[] := ARRAY[
    'projetos.read_vinculados',
    'operadores.vincular_projeto',
    'projetos.create',
    'projetos.edit',
    'operadores.read_self'
  ];
BEGIN
  -- Verificar se o usuário tem permissão para ver candidatos
  -- (deve poder gerenciar projetos ou operadores)
  IF NOT EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = _current_user_id
      AND wm.is_active = true
      AND wm.role IN ('owner', 'admin')
  ) THEN
    -- Verificar se tem permissão adicional
    IF NOT EXISTS (
      SELECT 1 FROM user_permission_overrides upo
      WHERE upo.workspace_id = _workspace_id
        AND upo.user_id = _current_user_id
        AND upo.permission_code IN ('projetos.edit', 'operadores.vincular_projeto')
    ) THEN
      RAISE EXCEPTION 'Sem permissão para visualizar candidatos';
    END IF;
  END IF;

  RETURN QUERY
  WITH base_permissions AS (
    -- Permissões base por role
    SELECT 
      wm.user_id,
      wm.role::text as role_base,
      rp.permission_code
    FROM workspace_members wm
    JOIN role_permissions rp ON rp.role = wm.role
    WHERE wm.workspace_id = _workspace_id
      AND wm.is_active = true
  ),
  extra_permissions AS (
    -- Permissões adicionais
    SELECT 
      upo.user_id,
      upo.permission_code
    FROM user_permission_overrides upo
    WHERE upo.workspace_id = _workspace_id
  ),
  eligible_users AS (
    SELECT DISTINCT
      wm.user_id,
      wm.role::text as role_base,
      -- Elegível por role base (operator, admin, owner têm permissões de projeto)
      wm.role IN ('operator', 'admin', 'owner') as eligible_by_role,
      -- Elegível por permissão adicional
      EXISTS (
        SELECT 1 FROM extra_permissions ep
        WHERE ep.user_id = wm.user_id
          AND ep.permission_code = ANY(_eligible_permissions)
      ) as eligible_by_extra
    FROM workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.is_active = true
      AND (
        -- Role com permissões de projeto
        wm.role IN ('operator', 'admin', 'owner')
        OR
        -- Permissão adicional que permite trabalhar em projetos
        EXISTS (
          SELECT 1 FROM extra_permissions ep
          WHERE ep.user_id = wm.user_id
            AND ep.permission_code = ANY(_eligible_permissions)
        )
      )
  )
  SELECT 
    eu.user_id,
    COALESCE(p.full_name, p.email, 'Usuário sem nome') as display_name,
    p.email,
    p.cpf,
    eu.role_base,
    eu.eligible_by_role,
    eu.eligible_by_extra,
    o.id as operador_id
  FROM eligible_users eu
  JOIN profiles p ON p.id = eu.user_id
  LEFT JOIN operadores o ON o.auth_user_id = eu.user_id AND o.workspace_id = _workspace_id
  ORDER BY p.full_name, p.email;
END;
$$;

-- Função para validar elegibilidade antes de criar vínculo
CREATE OR REPLACE FUNCTION public.validate_operator_eligibility(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _eligible_permissions text[] := ARRAY[
    'projetos.read_vinculados',
    'operadores.vincular_projeto',
    'projetos.create',
    'projetos.edit',
    'operadores.read_self'
  ];
BEGIN
  -- Verificar se o usuário é membro ativo do workspace
  IF NOT EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = _user_id
      AND wm.is_active = true
  ) THEN
    RETURN false;
  END IF;

  -- Verificar elegibilidade por role ou permissão adicional
  RETURN EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = _user_id
      AND wm.is_active = true
      AND (
        wm.role IN ('operator', 'admin', 'owner')
        OR EXISTS (
          SELECT 1 FROM user_permission_overrides upo
          WHERE upo.workspace_id = _workspace_id
            AND upo.user_id = _user_id
            AND upo.permission_code = ANY(_eligible_permissions)
        )
      )
  );
END;
$$;

COMMENT ON FUNCTION public.get_project_operator_candidates IS 
'Retorna usuários elegíveis para vínculo em projetos baseado em permissões efetivas (role + adicionais)';

COMMENT ON FUNCTION public.validate_operator_eligibility IS 
'Valida se um usuário está elegível para ser vinculado a projetos no workspace';