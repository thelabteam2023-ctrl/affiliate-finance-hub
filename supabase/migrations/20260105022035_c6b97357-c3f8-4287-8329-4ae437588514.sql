
-- ============================================
-- REFATORAÇÃO: Gestão de Usuários Agrupada
-- ============================================

-- 1. Criar tipo para representar um vínculo workspace-role
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_workspace_membership') THEN
    CREATE TYPE public.user_workspace_membership AS (
      workspace_id UUID,
      workspace_name TEXT,
      role TEXT,
      is_active BOOLEAN,
      joined_at TIMESTAMPTZ
    );
  END IF;
END $$;

-- 2. Criar nova função que agrupa por usuário
CREATE OR REPLACE FUNCTION public.admin_get_users_grouped()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  public_id VARCHAR,
  created_at TIMESTAMPTZ,
  is_blocked BOOLEAN,
  blocked_at TIMESTAMPTZ,
  blocked_reason TEXT,
  is_system_owner BOOLEAN,
  is_deleted BOOLEAN,
  last_login_global TIMESTAMPTZ,
  workspaces_count INTEGER,
  workspaces JSONB  -- Array de objetos {workspace_id, workspace_name, role, is_active, joined_at}
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.public_id,
    p.created_at,
    COALESCE(p.is_blocked, false) as is_blocked,
    p.blocked_at,
    p.blocked_reason,
    COALESCE(p.is_system_owner, false) as is_system_owner,
    (p.email LIKE '%@removed.local') as is_deleted,
    p.last_login_at as last_login_global,
    COALESCE(
      (SELECT COUNT(*)::INTEGER FROM workspace_members wm WHERE wm.user_id = p.id AND wm.is_active = true),
      0
    ) as workspaces_count,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'workspace_id', wm.workspace_id,
            'workspace_name', w.name,
            'role', wm.role,
            'is_active', wm.is_active,
            'joined_at', wm.created_at
          ) ORDER BY wm.created_at
        )
        FROM workspace_members wm
        JOIN workspaces w ON w.id = wm.workspace_id
        WHERE wm.user_id = p.id AND wm.is_active = true
      ),
      '[]'::jsonb
    ) as workspaces
  FROM profiles p
  WHERE p.email NOT LIKE '%@removed.local'
  ORDER BY p.created_at DESC;
END;
$$;

-- 3. Criar versão para usuários deletados
CREATE OR REPLACE FUNCTION public.admin_get_deleted_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  public_id VARCHAR,
  created_at TIMESTAMPTZ,
  is_blocked BOOLEAN,
  blocked_at TIMESTAMPTZ,
  blocked_reason TEXT,
  is_system_owner BOOLEAN,
  last_login_global TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.public_id,
    p.created_at,
    COALESCE(p.is_blocked, false) as is_blocked,
    p.blocked_at,
    p.blocked_reason,
    COALESCE(p.is_system_owner, false) as is_system_owner,
    p.last_login_at as last_login_global
  FROM profiles p
  WHERE p.email LIKE '%@removed.local'
  ORDER BY p.created_at DESC;
END;
$$;
