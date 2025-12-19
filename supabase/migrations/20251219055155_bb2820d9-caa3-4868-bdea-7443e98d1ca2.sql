-- =====================================================
-- CORREÇÃO: System Owner deve ver TODOS os workspaces
-- Para configurar bookmakers com visibilidade "Restrita"
-- =====================================================

-- Remover policy atual que limita visão
DROP POLICY IF EXISTS "Members can view their workspace" ON workspaces;

-- Criar nova policy que permite:
-- 1. System Owner ver TODOS os workspaces
-- 2. Membros verem seus próprios workspaces
CREATE POLICY "View workspaces"
ON workspaces
FOR SELECT
USING (
  is_system_owner(auth.uid()) 
  OR id IN (
    SELECT workspace_id 
    FROM workspace_members 
    WHERE user_id = auth.uid() AND is_active = true
  )
);