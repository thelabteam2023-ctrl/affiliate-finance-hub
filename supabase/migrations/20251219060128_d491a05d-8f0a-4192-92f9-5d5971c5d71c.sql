-- =====================================================
-- GRUPOS DE LIBERAÇÃO - Sistema de acesso em lote
-- Exclusivo para System Owner
-- =====================================================

-- 1. Tabela principal de grupos
CREATE TABLE public.access_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Vínculo grupo ↔ workspaces
CREATE TABLE public.access_group_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID REFERENCES auth.users(id),
  UNIQUE(group_id, workspace_id)
);

-- 3. Vínculo grupo ↔ bookmakers
CREATE TABLE public.access_group_bookmakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  bookmaker_catalogo_id UUID NOT NULL REFERENCES public.bookmakers_catalogo(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID REFERENCES auth.users(id),
  UNIQUE(group_id, bookmaker_catalogo_id)
);

-- 4. Índices para performance
CREATE INDEX idx_access_group_workspaces_group ON access_group_workspaces(group_id);
CREATE INDEX idx_access_group_workspaces_workspace ON access_group_workspaces(workspace_id);
CREATE INDEX idx_access_group_bookmakers_group ON access_group_bookmakers(group_id);
CREATE INDEX idx_access_group_bookmakers_bookmaker ON access_group_bookmakers(bookmaker_catalogo_id);

-- 5. RLS - Somente System Owner pode gerenciar
ALTER TABLE public.access_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_group_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_group_bookmakers ENABLE ROW LEVEL SECURITY;

-- Policy: System Owner tem acesso total
CREATE POLICY "System Owner full access" ON public.access_groups
  FOR ALL USING (is_system_owner(auth.uid()));

CREATE POLICY "System Owner full access" ON public.access_group_workspaces
  FOR ALL USING (is_system_owner(auth.uid()));

CREATE POLICY "System Owner full access" ON public.access_group_bookmakers
  FOR ALL USING (is_system_owner(auth.uid()));

-- 6. Função para verificar acesso via grupo
CREATE OR REPLACE FUNCTION public.workspace_has_group_access(
  _workspace_id UUID,
  _bookmaker_catalogo_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM access_group_workspaces agw
    INNER JOIN access_group_bookmakers agb ON agw.group_id = agb.group_id
    INNER JOIN access_groups ag ON agw.group_id = ag.id
    WHERE agw.workspace_id = _workspace_id
      AND agb.bookmaker_catalogo_id = _bookmaker_catalogo_id
      AND ag.status = 'active'
  )
$$;

-- 7. Trigger para updated_at
CREATE TRIGGER update_access_groups_updated_at
  BEFORE UPDATE ON public.access_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Atualizar policy de bookmakers_catalogo para considerar grupos
DROP POLICY IF EXISTS "View bookmakers catalogo" ON public.bookmakers_catalogo;

CREATE POLICY "View bookmakers catalogo" ON public.bookmakers_catalogo
  FOR SELECT USING (
    -- System Owner vê tudo
    is_system_owner(auth.uid())
    -- Global: todos veem (GLOBAL_REGULATED)
    OR visibility = 'GLOBAL_REGULATED'
    -- Private: somente o criador (WORKSPACE_PRIVATE)
    OR (visibility = 'WORKSPACE_PRIVATE' AND user_id = auth.uid())
    -- Restricted: acesso direto OU via grupo (GLOBAL_RESTRICTED)
    OR (
      visibility = 'GLOBAL_RESTRICTED' 
      AND (
        -- Acesso direto por workspace
        EXISTS (
          SELECT 1 FROM bookmaker_workspace_access bwa
          WHERE bwa.bookmaker_catalogo_id = bookmakers_catalogo.id
            AND bwa.workspace_id = get_user_workspace(auth.uid())
        )
        -- Acesso via grupo
        OR workspace_has_group_access(get_user_workspace(auth.uid()), bookmakers_catalogo.id)
      )
    )
  );