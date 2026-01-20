-- CORREÇÃO EM LOTE: Tabelas com RLS que permitem ver TODOS os workspaces do usuário
-- Todas devem usar workspace_id = get_current_workspace()

-- 1. bookmaker_balance_audit
DROP POLICY IF EXISTS "Usuários podem ver audits do seu workspace" ON bookmaker_balance_audit;
CREATE POLICY bookmaker_balance_audit_select ON bookmaker_balance_audit
  FOR SELECT USING (workspace_id = get_current_workspace());

-- 2. cashback_manual - todas as operações
DROP POLICY IF EXISTS "Usuários podem ver cashback do próprio workspace" ON cashback_manual;
DROP POLICY IF EXISTS "Usuários podem atualizar cashback do próprio workspace" ON cashback_manual;
DROP POLICY IF EXISTS "Usuários podem deletar cashback do próprio workspace" ON cashback_manual;
DROP POLICY IF EXISTS "Usuários podem inserir cashback no próprio workspace" ON cashback_manual;

CREATE POLICY cashback_manual_select ON cashback_manual
  FOR SELECT USING (workspace_id = get_current_workspace());

CREATE POLICY cashback_manual_insert ON cashback_manual
  FOR INSERT WITH CHECK (workspace_id = get_current_workspace() AND user_id = auth.uid());

CREATE POLICY cashback_manual_update ON cashback_manual
  FOR UPDATE USING (workspace_id = get_current_workspace());

CREATE POLICY cashback_manual_delete ON cashback_manual
  FOR DELETE USING (workspace_id = get_current_workspace());

-- 3. moderation_logs (apenas admins/owners)
DROP POLICY IF EXISTS "Workspace admins can view their moderation logs" ON moderation_logs;
CREATE POLICY moderation_logs_select ON moderation_logs
  FOR SELECT USING (
    workspace_id = get_current_workspace() 
    AND is_workspace_owner_or_admin(auth.uid(), workspace_id)
  );