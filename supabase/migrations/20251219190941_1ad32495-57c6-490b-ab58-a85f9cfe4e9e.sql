
-- ============================================
-- FUNÇÃO get_effective_access
-- Fonte única da verdade para permissões efetivas
-- ============================================

CREATE OR REPLACE FUNCTION public.get_effective_access(_user_id uuid, _workspace_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_workspace_id UUID;
  v_role public.app_role;
  v_is_system_owner BOOLEAN;
  v_base_permissions TEXT[];
  v_additional_permissions TEXT[];
  v_effective_permissions TEXT[];
  v_workspace_plan TEXT;
  v_workspace_name TEXT;
BEGIN
  -- 1. Check if system owner (global admin)
  v_is_system_owner := public.is_system_owner(_user_id);
  
  -- 2. Get workspace ID
  v_workspace_id := COALESCE(_workspace_id, public.get_user_workspace(_user_id));
  
  IF v_workspace_id IS NULL AND NOT v_is_system_owner THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NO_WORKSPACE',
      'message', 'User has no active workspace'
    );
  END IF;
  
  -- 3. Get workspace details
  IF v_workspace_id IS NOT NULL THEN
    SELECT name, plan INTO v_workspace_name, v_workspace_plan
    FROM workspaces
    WHERE id = v_workspace_id;
  END IF;
  
  -- 4. Get user role in workspace
  v_role := public.get_user_role(_user_id, v_workspace_id);
  
  IF v_role IS NULL AND NOT v_is_system_owner THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NO_MEMBERSHIP',
      'message', 'User is not a member of this workspace'
    );
  END IF;
  
  -- 5. Get base permissions from role
  SELECT COALESCE(ARRAY_AGG(permission_code), '{}')
  INTO v_base_permissions
  FROM role_permissions
  WHERE role = v_role;
  
  -- 6. Get additional permissions (overrides)
  SELECT COALESCE(ARRAY_AGG(permission_code), '{}')
  INTO v_additional_permissions
  FROM user_permission_overrides
  WHERE user_id = _user_id
    AND workspace_id = v_workspace_id
    AND granted = true
    AND (expires_at IS NULL OR expires_at > now());
  
  -- 7. Calculate effective permissions (merge base + additional)
  -- For system_owner: all permissions
  -- For owner: all permissions (implicit)
  -- For others: base + additional
  IF v_is_system_owner OR v_role = 'owner' THEN
    -- Get ALL permissions as effective
    SELECT COALESCE(ARRAY_AGG(DISTINCT code), '{}')
    INTO v_effective_permissions
    FROM permissions;
  ELSE
    -- Merge base + additional, remove duplicates
    SELECT ARRAY(
      SELECT DISTINCT unnest(v_base_permissions || v_additional_permissions)
      ORDER BY 1
    ) INTO v_effective_permissions;
  END IF;
  
  -- 8. Return complete access object
  RETURN jsonb_build_object(
    'success', true,
    'user_id', _user_id,
    'workspace_id', v_workspace_id,
    'workspace_name', v_workspace_name,
    'workspace_plan', v_workspace_plan,
    'is_system_owner', v_is_system_owner,
    'role', v_role,
    'role_label', CASE v_role
      WHEN 'owner' THEN 'Proprietário'
      WHEN 'admin' THEN 'Administrador'
      WHEN 'finance' THEN 'Financeiro'
      WHEN 'operator' THEN 'Operador'
      WHEN 'viewer' THEN 'Visualizador'
      ELSE COALESCE(v_role::text, 'Usuário')
    END,
    'base_permissions', v_base_permissions,
    'additional_permissions', v_additional_permissions,
    'effective_permissions', v_effective_permissions,
    'fetched_at', now()
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_effective_access(uuid, uuid) TO authenticated;

-- ============================================
-- FUNÇÃO has_route_access
-- Verifica se usuário pode acessar uma rota específica
-- ============================================

CREATE OR REPLACE FUNCTION public.has_route_access(_user_id uuid, _route text, _workspace_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_access jsonb;
  v_required_permission TEXT;
  v_required_roles TEXT[];
  v_has_access BOOLEAN := false;
  v_deny_reason TEXT := NULL;
BEGIN
  -- Get user's effective access
  v_access := public.get_effective_access(_user_id, _workspace_id);
  
  -- If get_effective_access failed, return the error
  IF NOT (v_access->>'success')::boolean THEN
    RETURN v_access;
  END IF;
  
  -- System owner has access to everything
  IF (v_access->>'is_system_owner')::boolean THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'route', _route,
      'reason', 'SYSTEM_OWNER'
    );
  END IF;
  
  -- Route permission mapping
  -- Central (/) - everyone
  IF _route = '/' OR _route = '' THEN
    RETURN jsonb_build_object('allowed', true, 'route', _route, 'reason', 'PUBLIC_ROUTE');
  END IF;
  
  -- Map routes to required permissions
  CASE
    -- Operation routes
    WHEN _route = '/projetos' OR _route LIKE '/projeto/%' THEN
      v_required_permission := 'projetos.read';
    WHEN _route = '/bookmakers' THEN
      v_required_permission := 'bookmakers.catalog.read';
    -- Finance routes
    WHEN _route = '/caixa' THEN
      v_required_permission := 'caixa.read';
    WHEN _route = '/financeiro' THEN
      v_required_permission := 'financeiro.read';
    WHEN _route = '/bancos' THEN
      v_required_permission := 'financeiro.read';
    WHEN _route = '/investidores' THEN
      v_required_permission := 'investidores.read';
    -- Relationship routes
    WHEN _route = '/parceiros' THEN
      v_required_permission := 'parceiros.read';
    WHEN _route = '/operadores' THEN
      v_required_permission := 'operadores.read';
    -- Growth routes
    WHEN _route = '/programa-indicacao' THEN
      v_required_permission := 'captacao.read';
    -- Community routes (plan-based, checked separately)
    WHEN _route = '/comunidade' OR _route LIKE '/comunidade/%' THEN
      v_required_permission := NULL; -- Plan-based check
      v_has_access := true; -- Allow by default, community has its own access control
    -- Admin routes
    WHEN _route = '/workspace' THEN
      v_required_roles := ARRAY['owner', 'admin'];
    WHEN _route = '/admin' THEN
      -- Already handled by system_owner check above
      RETURN jsonb_build_object('allowed', false, 'route', _route, 'reason', 'REQUIRES_SYSTEM_OWNER');
    WHEN _route = '/testes' THEN
      v_required_roles := ARRAY['owner'];
    ELSE
      -- Unknown route - deny by default
      RETURN jsonb_build_object('allowed', false, 'route', _route, 'reason', 'UNKNOWN_ROUTE');
  END CASE;
  
  -- Check role requirement
  IF v_required_roles IS NOT NULL THEN
    IF (v_access->>'role')::text = ANY(v_required_roles) THEN
      RETURN jsonb_build_object('allowed', true, 'route', _route, 'reason', 'ROLE_MATCH');
    ELSE
      RETURN jsonb_build_object(
        'allowed', false, 
        'route', _route, 
        'reason', 'ROLE_INSUFFICIENT',
        'required_roles', v_required_roles,
        'user_role', v_access->>'role'
      );
    END IF;
  END IF;
  
  -- Check permission requirement
  IF v_required_permission IS NOT NULL THEN
    -- Owner and admin bypass permission checks
    IF (v_access->>'role')::text IN ('owner', 'admin') THEN
      RETURN jsonb_build_object('allowed', true, 'route', _route, 'reason', 'OWNER_OR_ADMIN_BYPASS');
    END IF;
    
    -- Check if user has the required permission
    IF v_required_permission = ANY(
      SELECT jsonb_array_elements_text(v_access->'effective_permissions')
    ) THEN
      RETURN jsonb_build_object('allowed', true, 'route', _route, 'reason', 'PERMISSION_GRANTED');
    ELSE
      RETURN jsonb_build_object(
        'allowed', false,
        'route', _route,
        'reason', 'PERMISSION_MISSING',
        'required_permission', v_required_permission,
        'user_role', v_access->>'role'
      );
    END IF;
  END IF;
  
  -- Default: allow if we got here with v_has_access = true
  RETURN jsonb_build_object(
    'allowed', v_has_access,
    'route', _route,
    'reason', CASE WHEN v_has_access THEN 'DEFAULT_ALLOW' ELSE 'DEFAULT_DENY' END
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.has_route_access(uuid, text, uuid) TO authenticated;
