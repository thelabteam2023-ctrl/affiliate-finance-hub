-- =====================================================
-- CORREÇÃO DAS POLÍTICAS RLS DO BOOKMAKERS_CATALOGO
-- Implementa visibilidade baseada em: GLOBAL_REGULATED, GLOBAL_RESTRICTED, WORKSPACE_PRIVATE
-- =====================================================

-- Dropar políticas antigas do bookmakers_catalogo
DROP POLICY IF EXISTS "System bookmakers are visible to all" ON bookmakers_catalogo;
DROP POLICY IF EXISTS "Users can delete own bookmakers_catalogo" ON bookmakers_catalogo;
DROP POLICY IF EXISTS "Users can insert own bookmakers_catalogo" ON bookmakers_catalogo;
DROP POLICY IF EXISTS "Users can update own bookmakers_catalogo" ON bookmakers_catalogo;
DROP POLICY IF EXISTS "Users can view own bookmakers_catalogo" ON bookmakers_catalogo;
DROP POLICY IF EXISTS "bookmakers_catalogo_visibility_policy" ON bookmakers_catalogo;

-- =====================================================
-- POLÍTICA DE LEITURA (SELECT)
-- =====================================================
CREATE POLICY "bookmakers_catalogo_select_policy" ON bookmakers_catalogo
FOR SELECT USING (
  -- Masters veem tudo
  is_master(auth.uid())
  
  -- GLOBAL_REGULATED: todos os usuários autenticados veem
  OR visibility = 'GLOBAL_REGULATED'
  
  -- GLOBAL_RESTRICTED: apenas workspaces com acesso explícito
  OR (
    visibility = 'GLOBAL_RESTRICTED' 
    AND EXISTS (
      SELECT 1 FROM bookmaker_workspace_access bwa 
      WHERE bwa.bookmaker_catalogo_id = bookmakers_catalogo.id 
      AND bwa.workspace_id = get_user_workspace(auth.uid())
    )
  )
  
  -- WORKSPACE_PRIVATE: apenas quem pertence ao mesmo workspace do criador
  OR (
    visibility = 'WORKSPACE_PRIVATE' 
    AND (
      -- Criador direto
      user_id = auth.uid()
      -- Ou pertence ao mesmo workspace
      OR EXISTS (
        SELECT 1 FROM workspace_members wm1
        JOIN workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
        WHERE wm1.user_id = auth.uid() 
        AND wm2.user_id = bookmakers_catalogo.user_id
        AND wm1.is_active = true AND wm2.is_active = true
      )
    )
  )
  
  -- Fallback para casas antigas sem visibility definido (tratar como global regulamentada)
  OR (visibility IS NULL AND status = 'REGULAMENTADA')
);

-- =====================================================
-- POLÍTICA DE INSERÇÃO (INSERT)
-- =====================================================
CREATE POLICY "bookmakers_catalogo_insert_policy" ON bookmakers_catalogo
FOR INSERT WITH CHECK (
  -- Masters podem criar qualquer tipo
  is_master(auth.uid())
  
  -- Usuários comuns só podem criar WORKSPACE_PRIVATE
  OR (
    auth.uid() IS NOT NULL
    AND (visibility IS NULL OR visibility = 'WORKSPACE_PRIVATE')
  )
);

-- =====================================================
-- POLÍTICA DE ATUALIZAÇÃO (UPDATE)
-- =====================================================
CREATE POLICY "bookmakers_catalogo_update_policy" ON bookmakers_catalogo
FOR UPDATE USING (
  -- Masters podem atualizar qualquer coisa
  is_master(auth.uid())
  
  -- Criador pode atualizar suas próprias casas privadas
  OR (
    user_id = auth.uid() 
    AND visibility = 'WORKSPACE_PRIVATE'
  )
);

-- =====================================================
-- POLÍTICA DE DELEÇÃO (DELETE)
-- =====================================================
CREATE POLICY "bookmakers_catalogo_delete_policy" ON bookmakers_catalogo
FOR DELETE USING (
  -- Masters podem deletar qualquer coisa (exceto is_system)
  (is_master(auth.uid()) AND is_system = false)
  
  -- Criador pode deletar suas próprias casas privadas
  OR (
    user_id = auth.uid() 
    AND visibility = 'WORKSPACE_PRIVATE'
    AND is_system = false
  )
);

-- =====================================================
-- POLÍTICAS PARA BOOKMAKER_WORKSPACE_ACCESS
-- =====================================================
DROP POLICY IF EXISTS "Users can view workspace access" ON bookmaker_workspace_access;
DROP POLICY IF EXISTS "Admins can manage workspace access" ON bookmaker_workspace_access;

-- Visualizar acessos do próprio workspace
CREATE POLICY "bookmaker_workspace_access_select" ON bookmaker_workspace_access
FOR SELECT USING (
  workspace_id = get_user_workspace(auth.uid())
  OR is_master(auth.uid())
  OR is_owner_or_admin(auth.uid())
);

-- Gerenciar acessos (apenas owner/admin/master)
CREATE POLICY "bookmaker_workspace_access_all" ON bookmaker_workspace_access
FOR ALL USING (
  is_owner_or_admin(auth.uid()) OR is_master(auth.uid())
);

-- =====================================================
-- ATUALIZAR CASAS EXISTENTES PARA TER VISIBILITY CORRETO
-- =====================================================
-- Casas regulamentadas antigas → GLOBAL_REGULATED
UPDATE bookmakers_catalogo 
SET visibility = 'GLOBAL_REGULATED'
WHERE visibility IS NULL AND status = 'REGULAMENTADA';

-- Casas não regulamentadas sem visibility → WORKSPACE_PRIVATE
UPDATE bookmakers_catalogo 
SET visibility = 'WORKSPACE_PRIVATE'
WHERE visibility IS NULL AND status = 'NAO_REGULAMENTADA';

-- =====================================================
-- GARANTIR QUE RLS ESTÁ HABILITADO
-- =====================================================
ALTER TABLE bookmaker_workspace_access ENABLE ROW LEVEL SECURITY;