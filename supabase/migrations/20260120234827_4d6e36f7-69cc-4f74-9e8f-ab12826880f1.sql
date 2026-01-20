-- CORREÇÃO CRÍTICA: exchange_adjustments também tem RLS que permite ver TODOS os workspaces do usuário
-- Deve usar workspace_id = get_current_workspace()

DROP POLICY IF EXISTS "Users can view exchange adjustments in their workspace" ON exchange_adjustments;
DROP POLICY IF EXISTS "Users can insert exchange adjustments in their workspace" ON exchange_adjustments;
DROP POLICY IF EXISTS "Users can update exchange adjustments in their workspace" ON exchange_adjustments;
DROP POLICY IF EXISTS "Users can delete exchange adjustments in their workspace" ON exchange_adjustments;

CREATE POLICY exchange_adjustments_select ON exchange_adjustments
  FOR SELECT USING (workspace_id = get_current_workspace());

CREATE POLICY exchange_adjustments_insert ON exchange_adjustments
  FOR INSERT WITH CHECK (workspace_id = get_current_workspace() AND user_id = auth.uid());

CREATE POLICY exchange_adjustments_update ON exchange_adjustments
  FOR UPDATE USING (workspace_id = get_current_workspace());

CREATE POLICY exchange_adjustments_delete ON exchange_adjustments
  FOR DELETE USING (workspace_id = get_current_workspace());