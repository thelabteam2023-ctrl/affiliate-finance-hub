-- =========================================
-- MIGRATION: Proteção de Arquivamento de Grupos
-- =========================================

-- 1. Adicionar campos de arquivamento na tabela access_groups
ALTER TABLE public.access_groups 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS archived_by UUID,
ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- 2. Criar tabela de auditoria para ações em grupos
CREATE TABLE IF NOT EXISTS public.access_group_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'archive', 'reactivate', 'delete', 'convert_to_direct'
  actor_user_id UUID NOT NULL,
  affected_workspaces UUID[] DEFAULT '{}',
  affected_bookmakers UUID[] DEFAULT '{}',
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para buscar por grupo
CREATE INDEX IF NOT EXISTS idx_access_group_audit_log_group_id 
ON public.access_group_audit_log(group_id);

-- RLS para a tabela de auditoria (apenas system owners)
ALTER TABLE public.access_group_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System owners can view audit logs" ON public.access_group_audit_log
  FOR SELECT USING (public.is_system_owner(auth.uid()));

CREATE POLICY "System owners can insert audit logs" ON public.access_group_audit_log
  FOR INSERT WITH CHECK (public.is_system_owner(auth.uid()));

-- 3. Função para calcular impacto do arquivamento
CREATE OR REPLACE FUNCTION public.admin_calculate_group_archive_impact(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSONB;
  v_workspace_ids UUID[];
  v_bookmaker_ids UUID[];
  v_workspaces_using JSONB := '[]'::JSONB;
  v_workspaces_not_using JSONB := '[]'::JSONB;
  v_ws RECORD;
BEGIN
  -- Verificar se é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  -- Obter workspaces do grupo
  SELECT ARRAY_AGG(workspace_id) INTO v_workspace_ids
  FROM access_group_workspaces
  WHERE group_id = p_group_id;
  
  v_workspace_ids := COALESCE(v_workspace_ids, '{}'::UUID[]);

  -- Obter bookmakers do grupo
  SELECT ARRAY_AGG(bookmaker_catalogo_id) INTO v_bookmaker_ids
  FROM access_group_bookmakers
  WHERE group_id = p_group_id;
  
  v_bookmaker_ids := COALESCE(v_bookmaker_ids, '{}'::UUID[]);

  -- Para cada workspace, verificar se já usa bookmakers do grupo
  FOR v_ws IN 
    SELECT 
      agw.workspace_id,
      w.name as workspace_name,
      p.email as owner_email,
      p.public_id as owner_public_id
    FROM access_group_workspaces agw
    JOIN workspaces w ON w.id = agw.workspace_id
    LEFT JOIN workspace_members wm ON wm.workspace_id = agw.workspace_id AND wm.role = 'owner'
    LEFT JOIN profiles p ON p.id = wm.user_id
    WHERE agw.group_id = p_group_id
  LOOP
    DECLARE
      v_bookmakers_count INT;
      v_has_usage BOOLEAN := FALSE;
      v_usage_details JSONB;
    BEGIN
      -- Contar bookmakers usados do grupo neste workspace
      SELECT COUNT(*) INTO v_bookmakers_count
      FROM bookmakers b
      WHERE b.workspace_id = v_ws.workspace_id
        AND b.bookmaker_catalogo_id = ANY(v_bookmaker_ids);
      
      v_has_usage := v_bookmakers_count > 0;
      
      v_usage_details := jsonb_build_object(
        'workspace_id', v_ws.workspace_id,
        'workspace_name', v_ws.workspace_name,
        'owner_email', v_ws.owner_email,
        'owner_public_id', v_ws.owner_public_id,
        'bookmakers_in_use', v_bookmakers_count
      );
      
      IF v_has_usage THEN
        v_workspaces_using := v_workspaces_using || v_usage_details;
      ELSE
        v_workspaces_not_using := v_workspaces_not_using || v_usage_details;
      END IF;
    END;
  END LOOP;

  -- Montar resultado
  v_result := jsonb_build_object(
    'group_id', p_group_id,
    'total_workspaces', COALESCE(array_length(v_workspace_ids, 1), 0),
    'total_bookmakers', COALESCE(array_length(v_bookmaker_ids, 1), 0),
    'workspaces_using', v_workspaces_using,
    'workspaces_not_using', v_workspaces_not_using,
    'workspaces_using_count', jsonb_array_length(v_workspaces_using),
    'workspaces_not_using_count', jsonb_array_length(v_workspaces_not_using)
  );

  RETURN v_result;
END;
$$;

-- 4. Função para arquivar grupo com proteção
CREATE OR REPLACE FUNCTION public.admin_archive_group(
  p_group_id UUID,
  p_convert_to_direct_access BOOLEAN DEFAULT TRUE,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSONB;
  v_workspace_ids UUID[];
  v_bookmaker_ids UUID[];
  v_converted_count INT := 0;
  v_ws RECORD;
  v_bm UUID;
BEGIN
  -- Verificar se é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  -- Verificar se grupo existe e está ativo
  IF NOT EXISTS (SELECT 1 FROM access_groups WHERE id = p_group_id AND status = 'active') THEN
    RAISE EXCEPTION 'Grupo não encontrado ou já arquivado';
  END IF;

  -- Obter bookmakers do grupo
  SELECT ARRAY_AGG(bookmaker_catalogo_id) INTO v_bookmaker_ids
  FROM access_group_bookmakers
  WHERE group_id = p_group_id;
  
  v_bookmaker_ids := COALESCE(v_bookmaker_ids, '{}'::UUID[]);

  -- Se conversão para acesso direto está habilitada
  IF p_convert_to_direct_access AND array_length(v_bookmaker_ids, 1) > 0 THEN
    -- Para cada workspace que usa bookmakers do grupo, criar acesso direto
    FOR v_ws IN 
      SELECT DISTINCT b.workspace_id
      FROM bookmakers b
      WHERE b.workspace_id IN (
        SELECT workspace_id FROM access_group_workspaces WHERE group_id = p_group_id
      )
      AND b.bookmaker_catalogo_id = ANY(v_bookmaker_ids)
    LOOP
      -- Para cada bookmaker do grupo que este workspace usa
      FOREACH v_bm IN ARRAY v_bookmaker_ids
      LOOP
        -- Verificar se workspace usa esta bookmaker
        IF EXISTS (
          SELECT 1 FROM bookmakers 
          WHERE workspace_id = v_ws.workspace_id 
          AND bookmaker_catalogo_id = v_bm
        ) THEN
          -- Criar acesso direto se não existir
          INSERT INTO bookmaker_workspace_access (workspace_id, bookmaker_catalogo_id, granted_by)
          VALUES (v_ws.workspace_id, v_bm, auth.uid())
          ON CONFLICT (workspace_id, bookmaker_catalogo_id) DO NOTHING;
          
          v_converted_count := v_converted_count + 1;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- Obter workspaces afetados para auditoria
  SELECT ARRAY_AGG(workspace_id) INTO v_workspace_ids
  FROM access_group_workspaces
  WHERE group_id = p_group_id;
  
  v_workspace_ids := COALESCE(v_workspace_ids, '{}'::UUID[]);

  -- Arquivar o grupo
  UPDATE access_groups
  SET 
    status = 'archived',
    archived_at = now(),
    archived_by = auth.uid(),
    archive_reason = p_reason,
    updated_at = now()
  WHERE id = p_group_id;

  -- Registrar na auditoria
  INSERT INTO access_group_audit_log (group_id, action, actor_user_id, affected_workspaces, affected_bookmakers, details)
  VALUES (
    p_group_id,
    'archive',
    auth.uid(),
    v_workspace_ids,
    v_bookmaker_ids,
    jsonb_build_object(
      'convert_to_direct_access', p_convert_to_direct_access,
      'converted_access_count', v_converted_count,
      'reason', p_reason
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'archived_at', now(),
    'workspaces_affected', COALESCE(array_length(v_workspace_ids, 1), 0),
    'bookmakers_affected', COALESCE(array_length(v_bookmaker_ids, 1), 0),
    'direct_access_created', v_converted_count
  );

  RETURN v_result;
END;
$$;

-- 5. Função para reativar grupo
CREATE OR REPLACE FUNCTION public.admin_reactivate_group(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSONB;
  v_workspace_ids UUID[];
  v_bookmaker_ids UUID[];
BEGIN
  -- Verificar se é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  -- Verificar se grupo existe e está arquivado
  IF NOT EXISTS (SELECT 1 FROM access_groups WHERE id = p_group_id AND status = 'archived') THEN
    RAISE EXCEPTION 'Grupo não encontrado ou não está arquivado';
  END IF;

  -- Obter dados para auditoria
  SELECT ARRAY_AGG(workspace_id) INTO v_workspace_ids
  FROM access_group_workspaces WHERE group_id = p_group_id;
  
  SELECT ARRAY_AGG(bookmaker_catalogo_id) INTO v_bookmaker_ids
  FROM access_group_bookmakers WHERE group_id = p_group_id;

  -- Reativar o grupo
  UPDATE access_groups
  SET 
    status = 'active',
    archived_at = NULL,
    archived_by = NULL,
    archive_reason = NULL,
    updated_at = now()
  WHERE id = p_group_id;

  -- Registrar na auditoria
  INSERT INTO access_group_audit_log (group_id, action, actor_user_id, affected_workspaces, affected_bookmakers, details)
  VALUES (
    p_group_id,
    'reactivate',
    auth.uid(),
    COALESCE(v_workspace_ids, '{}'::UUID[]),
    COALESCE(v_bookmaker_ids, '{}'::UUID[]),
    '{}'::JSONB
  );

  v_result := jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'reactivated_at', now()
  );

  RETURN v_result;
END;
$$;