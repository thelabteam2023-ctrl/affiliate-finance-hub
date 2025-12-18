-- =====================================================
-- MIGRAÇÃO: Remover papel Master e reestruturar sistema de permissões
-- =====================================================

-- 1) Migrar usuários com role 'master' para 'owner' (caso existam)
UPDATE public.workspace_members 
SET role = 'owner' 
WHERE role = 'master';

-- 2) Atualizar funções existentes para remover referências a 'master'

-- Atualizar is_owner_or_admin para não depender de master
CREATE OR REPLACE FUNCTION public.is_owner_or_admin(_user_id uuid, _workspace_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT public.get_user_role(_user_id, _workspace_id) IN ('owner', 'admin')
$$;

-- Atualizar has_permission para usar is_system_owner para bypass global
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_code text, _workspace_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_workspace_id UUID;
  v_role public.app_role;
  v_override_granted BOOLEAN;
  v_is_system_owner BOOLEAN;
BEGIN
  -- System Owner tem acesso total
  v_is_system_owner := public.is_system_owner(_user_id);
  IF v_is_system_owner THEN RETURN TRUE; END IF;
  
  v_workspace_id := COALESCE(_workspace_id, public.get_user_workspace(_user_id));
  IF v_workspace_id IS NULL THEN RETURN FALSE; END IF;
  
  v_role := public.get_user_role(_user_id, v_workspace_id);
  IF v_role IS NULL THEN RETURN FALSE; END IF;
  
  -- Owner do workspace tem acesso total dentro do workspace
  IF v_role = 'owner' THEN RETURN TRUE; END IF;
  
  -- Verificar override de permissão
  SELECT granted INTO v_override_granted FROM public.user_permission_overrides
  WHERE workspace_id = v_workspace_id AND user_id = _user_id AND permission_code = _permission_code
    AND (expires_at IS NULL OR expires_at > now());
  IF FOUND THEN RETURN v_override_granted; END IF;
  
  -- Verificar permissão por papel
  RETURN EXISTS (SELECT 1 FROM public.role_permissions WHERE role = v_role AND permission_code = _permission_code);
END;
$$;

-- Atualizar user_has_pro_access para remover master
CREATE OR REPLACE FUNCTION public.user_has_pro_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_workspace_id UUID;
  v_plan TEXT;
  v_role TEXT;
BEGIN
  -- System Owner sempre tem acesso
  IF public.is_system_owner(_user_id) THEN
    RETURN TRUE;
  END IF;
  
  -- Buscar workspace do usuário
  SELECT workspace_id INTO v_workspace_id
  FROM workspace_members
  WHERE user_id = _user_id AND is_active = true
  LIMIT 1;
  
  IF v_workspace_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Owner do workspace tem bypass de plano
  SELECT role::text INTO v_role
  FROM workspace_members
  WHERE user_id = _user_id AND workspace_id = v_workspace_id AND is_active = true
  LIMIT 1;
  
  IF v_role = 'owner' THEN
    RETURN TRUE;
  END IF;
  
  -- Buscar plano do workspace
  SELECT plan INTO v_plan
  FROM workspaces
  WHERE id = v_workspace_id;
  
  -- PRO e Advanced têm acesso
  RETURN v_plan IN ('pro', 'advanced');
END;
$$;

-- Atualizar user_is_owner_or_admin para remover master
CREATE OR REPLACE FUNCTION public.user_is_owner_or_admin(check_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    public.is_system_owner(check_user_id) 
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.user_id = check_user_id
        AND wm.is_active = true
        AND wm.role IN ('owner', 'admin')
    )
$$;

-- 3) Deprecar função is_master (manter por compatibilidade mas sempre retorna false)
CREATE OR REPLACE FUNCTION public.is_master(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  -- DEPRECATED: Master role foi removido. Usar is_system_owner() para privilégios globais.
  SELECT FALSE
$$;

-- 4) Atualizar políticas RLS do bookmakers_catalogo com nova lógica

-- Remover políticas antigas
DROP POLICY IF EXISTS "bookmakers_catalogo_delete_policy" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "bookmakers_catalogo_update_policy" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "bookmakers_catalogo_insert_policy" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "bookmakers_catalogo_select_policy" ON public.bookmakers_catalogo;

-- SELECT: Todos podem ver bookmakers públicas e do sistema; usuários veem suas privadas
CREATE POLICY "bookmakers_catalogo_select_policy" ON public.bookmakers_catalogo
FOR SELECT USING (
  -- System Owner vê tudo
  is_system_owner(auth.uid())
  OR
  -- Bookmakers do sistema são visíveis a todos
  is_system = true
  OR
  -- Bookmakers globais são visíveis a todos
  visibility IN ('GLOBAL_REGULATED', 'GLOBAL_RESTRICTED')
  OR
  -- Usuário pode ver suas próprias bookmakers privadas
  (user_id = auth.uid() AND visibility = 'WORKSPACE_PRIVATE')
);

-- INSERT: System Owner cria globais; Owner/Admin WS cria privadas
CREATE POLICY "bookmakers_catalogo_insert_policy" ON public.bookmakers_catalogo
FOR INSERT WITH CHECK (
  -- System Owner pode criar qualquer bookmaker (global ou sistema)
  is_system_owner(auth.uid())
  OR
  -- Owner/Admin do WS pode criar apenas bookmakers privadas do workspace (is_system DEVE ser false)
  (
    is_owner_or_admin(auth.uid()) 
    AND visibility = 'WORKSPACE_PRIVATE' 
    AND is_system = false
    AND auth.uid() = user_id
  )
);

-- UPDATE: System Owner edita globais; Owner/Admin WS edita privadas próprias
CREATE POLICY "bookmakers_catalogo_update_policy" ON public.bookmakers_catalogo
FOR UPDATE USING (
  -- System Owner pode editar QUALQUER bookmaker
  is_system_owner(auth.uid())
  OR
  -- Owner/Admin do WS pode editar suas próprias bookmakers privadas (nunca globais)
  (
    is_owner_or_admin(auth.uid()) 
    AND user_id = auth.uid() 
    AND visibility = 'WORKSPACE_PRIVATE' 
    AND is_system = false
  )
);

-- DELETE: System Owner deleta qualquer; Owner/Admin WS deleta privadas próprias
CREATE POLICY "bookmakers_catalogo_delete_policy" ON public.bookmakers_catalogo
FOR DELETE USING (
  -- System Owner pode deletar QUALQUER bookmaker
  is_system_owner(auth.uid())
  OR
  -- Owner/Admin do WS pode deletar suas próprias bookmakers privadas (nunca globais)
  (
    is_owner_or_admin(auth.uid()) 
    AND user_id = auth.uid() 
    AND visibility = 'WORKSPACE_PRIVATE' 
    AND is_system = false
  )
);

-- 5) Adicionar comentários nas tabelas para documentar modelo de permissões
COMMENT ON TABLE public.bookmakers_catalogo IS 'Catálogo de bookmakers. visibility: GLOBAL_REGULATED (pública), GLOBAL_RESTRICTED (restrita por workspace), WORKSPACE_PRIVATE (privada). is_system: gerenciado pelo sistema. Apenas System Owner pode criar/editar/deletar bookmakers globais.';