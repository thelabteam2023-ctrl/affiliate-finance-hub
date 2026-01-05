-- Atualizar funções de cleanup para incluir todas as tabelas novas

-- 1. Atualizar admin_cleanup_dry_run
CREATE OR REPLACE FUNCTION public.admin_cleanup_dry_run(_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_users_count integer;
  v_workspaces_count integer;
  v_workspace_ids uuid[];
  v_counts jsonb;
  v_validation_errors text[] := '{}';
BEGIN
  -- Verificar se caller é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  -- Não permitir limpar o próprio system owner
  IF auth.uid() = ANY(_user_ids) THEN
    RAISE EXCEPTION 'Cannot cleanup your own account';
  END IF;

  -- Verificar se algum dos usuários é system owner
  IF EXISTS (SELECT 1 FROM profiles WHERE id = ANY(_user_ids) AND is_system_owner = true) THEN
    RAISE EXCEPTION 'Cannot cleanup system owner accounts';
  END IF;

  -- Contar usuários selecionados
  SELECT COUNT(*) INTO v_users_count FROM profiles WHERE id = ANY(_user_ids);

  -- Identificar TODOS os workspaces dos usuários
  SELECT ARRAY_AGG(DISTINCT wm.workspace_id) INTO v_workspace_ids
  FROM workspace_members wm
  WHERE wm.user_id = ANY(_user_ids);

  v_workspace_ids := COALESCE(v_workspace_ids, '{}'::uuid[]);
  v_workspaces_count := COALESCE(array_length(v_workspace_ids, 1), 0);

  -- CONTAGEM ATUALIZADA COM TODAS AS TABELAS
  SELECT jsonb_build_object(
    -- ========== Tabelas com workspace_id ==========
    'parceiros', (SELECT COUNT(*) FROM parceiros WHERE workspace_id = ANY(v_workspace_ids)),
    'bookmakers', (SELECT COUNT(*) FROM bookmakers WHERE workspace_id = ANY(v_workspace_ids)),
    'projetos', (SELECT COUNT(*) FROM projetos WHERE workspace_id = ANY(v_workspace_ids)),
    'operadores', (SELECT COUNT(*) FROM operadores WHERE workspace_id = ANY(v_workspace_ids)),
    'investidores', (SELECT COUNT(*) FROM investidores WHERE workspace_id = ANY(v_workspace_ids)),
    'indicadores_referral', (SELECT COUNT(*) FROM indicadores_referral WHERE workspace_id = ANY(v_workspace_ids)),
    'fornecedores', (SELECT COUNT(*) FROM fornecedores WHERE workspace_id = ANY(v_workspace_ids)),
    'parcerias', (SELECT COUNT(*) FROM parcerias WHERE workspace_id = ANY(v_workspace_ids)),
    'despesas_administrativas', (SELECT COUNT(*) FROM despesas_administrativas WHERE workspace_id = ANY(v_workspace_ids)),
    'cash_ledger', (SELECT COUNT(*) FROM cash_ledger WHERE workspace_id = ANY(v_workspace_ids)),
    'community_chat_messages', (SELECT COUNT(*) FROM community_chat_messages WHERE workspace_id = ANY(v_workspace_ids)),
    'entregas', (SELECT COUNT(*) FROM entregas WHERE workspace_id = ANY(v_workspace_ids)),
    
    -- ========== NOVA: apostas_unificada (substituiu apostas, apostas_multiplas, surebets) ==========
    'apostas_unificada', (SELECT COUNT(*) FROM apostas_unificada WHERE workspace_id = ANY(v_workspace_ids)),
    
    -- ========== Tabelas com user_id ==========
    'freebets_recebidas', (SELECT COUNT(*) FROM freebets_recebidas WHERE user_id = ANY(_user_ids)),
    'projeto_perdas', (SELECT COUNT(*) FROM projeto_perdas WHERE user_id = ANY(_user_ids)),
    'projeto_conciliacoes', (SELECT COUNT(*) FROM projeto_conciliacoes WHERE user_id = ANY(_user_ids)),
    'projeto_ciclos', (SELECT COUNT(*) FROM projeto_ciclos WHERE user_id = ANY(_user_ids)),
    'projeto_bookmaker_historico', (SELECT COUNT(*) FROM projeto_bookmaker_historico WHERE user_id = ANY(_user_ids)),
    'pagamentos_operador', (SELECT COUNT(*) FROM pagamentos_operador WHERE user_id = ANY(_user_ids)),
    'pagamentos_propostos', (SELECT COUNT(*) FROM pagamentos_propostos WHERE user_id = ANY(_user_ids)),
    'participacao_ciclos', (SELECT COUNT(*) FROM participacao_ciclos WHERE user_id = ANY(_user_ids)),
    'operador_projetos', (SELECT COUNT(*) FROM operador_projetos WHERE user_id = ANY(_user_ids)),
    'investidor_deals', (SELECT COUNT(*) FROM investidor_deals WHERE user_id = ANY(_user_ids)),
    'movimentacoes_indicacao', (SELECT COUNT(*) FROM movimentacoes_indicacao WHERE user_id = ANY(_user_ids)),
    'promocao_participantes', (SELECT COUNT(*) FROM promocao_participantes WHERE user_id = ANY(_user_ids)),
    'promocoes_indicacao', (SELECT COUNT(*) FROM promocoes_indicacao WHERE user_id = ANY(_user_ids)),
    'indicacoes', (SELECT COUNT(*) FROM indicacoes WHERE user_id = ANY(_user_ids)),
    'indicador_acordos', (SELECT COUNT(*) FROM indicador_acordos WHERE user_id = ANY(_user_ids)),
    'parceiro_lucro_alertas', (SELECT COUNT(*) FROM parceiro_lucro_alertas WHERE user_id = ANY(_user_ids)),
    'community_topics', (SELECT COUNT(*) FROM community_topics WHERE user_id = ANY(_user_ids)),
    'community_comments', (SELECT COUNT(*) FROM community_comments WHERE user_id = ANY(_user_ids)),
    'community_evaluations', (SELECT COUNT(*) FROM community_evaluations WHERE user_id = ANY(_user_ids)),
    'user_favorites', (SELECT COUNT(*) FROM user_favorites WHERE user_id = ANY(_user_ids)),
    'community_reports', (SELECT COUNT(*) FROM community_reports WHERE reporter_user_id = ANY(_user_ids)),
    
    -- ========== NOVAS TABELAS ==========
    'project_bookmaker_link_bonuses', (
      SELECT COUNT(*) FROM project_bookmaker_link_bonuses 
      WHERE bookmaker_id IN (SELECT id FROM bookmakers WHERE workspace_id = ANY(v_workspace_ids))
    ),
    'project_favorites', (SELECT COUNT(*) FROM project_favorites WHERE user_id = ANY(_user_ids)),
    'login_history', (SELECT COUNT(*) FROM login_history WHERE user_id = ANY(_user_ids)),
    'moderation_logs', (SELECT COUNT(*) FROM moderation_logs WHERE moderator_user_id = ANY(_user_ids)),
    'user_influence_daily', (SELECT COUNT(*) FROM user_influence_daily WHERE user_id = ANY(_user_ids)),
    'user_influence_events', (SELECT COUNT(*) FROM user_influence_events WHERE user_id = ANY(_user_ids)),
    'user_influence_ranking', (SELECT COUNT(*) FROM user_influence_ranking WHERE user_id = ANY(_user_ids)),
    'workspace_invites', (SELECT COUNT(*) FROM workspace_invites WHERE workspace_id = ANY(v_workspace_ids)),
    'workspace_subscriptions', (SELECT COUNT(*) FROM workspace_subscriptions WHERE workspace_id = ANY(v_workspace_ids)),
    'billing_events', (SELECT COUNT(*) FROM billing_events WHERE workspace_id = ANY(v_workspace_ids)),
    'subscription_changes', (SELECT COUNT(*) FROM subscription_changes WHERE workspace_id = ANY(v_workspace_ids)),
    'bookmaker_unlinked_acks', (SELECT COUNT(*) FROM bookmaker_unlinked_acks WHERE workspace_id = ANY(v_workspace_ids)),
    'exchange_adjustments', (SELECT COUNT(*) FROM exchange_adjustments WHERE workspace_id = ANY(v_workspace_ids)),
    'sales_events', (SELECT COUNT(*) FROM sales_events WHERE workspace_id = ANY(v_workspace_ids)),
    
    -- ========== Tabelas vinculadas via JOINs ==========
    'transacoes_bookmakers', (
      SELECT COUNT(*) FROM transacoes_bookmakers 
      WHERE bookmaker_id IN (SELECT id FROM bookmakers WHERE workspace_id = ANY(v_workspace_ids))
    ),
    'wallets_crypto', (
      SELECT COUNT(*) FROM wallets_crypto 
      WHERE parceiro_id IN (SELECT id FROM parceiros WHERE workspace_id = ANY(v_workspace_ids))
    ),
    'contas_bancarias', (
      SELECT COUNT(*) FROM contas_bancarias 
      WHERE parceiro_id IN (SELECT id FROM parceiros WHERE workspace_id = ANY(v_workspace_ids))
    ),
    'operadores_legado_pendente', (
      SELECT COUNT(*) FROM operadores_legado_pendente 
      WHERE operador_id IN (SELECT id FROM operadores WHERE workspace_id = ANY(v_workspace_ids))
    ),
    
    -- ========== Workspace-level ==========
    'workspace_members', (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ANY(v_workspace_ids)),
    'user_permission_overrides', (SELECT COUNT(*) FROM user_permission_overrides WHERE workspace_id = ANY(v_workspace_ids)),
    'bookmaker_workspace_access', (SELECT COUNT(*) FROM bookmaker_workspace_access WHERE workspace_id = ANY(v_workspace_ids))
  ) INTO v_counts;

  v_result := jsonb_build_object(
    'success', true,
    'validated', true,
    'validation_errors', v_validation_errors,
    'summary', jsonb_build_object(
      'users_to_remove', v_users_count,
      'workspaces_to_remove', v_workspaces_count
    ),
    'workspace_ids', v_workspace_ids,
    'user_ids', _user_ids,
    'record_counts', v_counts
  );

  RETURN v_result;
END;
$$;

-- 2. Atualizar admin_execute_cleanup
CREATE OR REPLACE FUNCTION public.admin_execute_cleanup(_user_ids uuid[], _confirmation_phrase text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_ids uuid[];
  v_deleted_counts jsonb;
  v_count integer;
  v_total_deleted integer := 0;
BEGIN
  -- Verificações de segurança
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  IF _confirmation_phrase != 'CONFIRMAR LIMPEZA DEFINITIVA' THEN
    RAISE EXCEPTION 'Confirmation phrase does not match';
  END IF;

  IF auth.uid() = ANY(_user_ids) THEN
    RAISE EXCEPTION 'Cannot cleanup your own account';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = ANY(_user_ids) AND is_system_owner = true) THEN
    RAISE EXCEPTION 'Cannot cleanup system owner accounts';
  END IF;

  -- Registrar início
  INSERT INTO audit_logs (workspace_id, actor_user_id, action, entity_type, entity_name, metadata)
  VALUES (
    get_user_workspace(auth.uid()),
    auth.uid(),
    'DELETE',
    'system_cleanup',
    'Limpeza de contas de teste',
    jsonb_build_object('user_ids', _user_ids, 'phase', 'started')
  );

  -- Identificar workspaces
  SELECT ARRAY_AGG(DISTINCT wm.workspace_id) INTO v_workspace_ids
  FROM workspace_members wm
  WHERE wm.user_id = ANY(_user_ids);

  v_workspace_ids := COALESCE(v_workspace_ids, '{}'::uuid[]);
  v_deleted_counts := '{}'::jsonb;

  -- ========== FASE 1: Entidades folha (dependem de outras via FK) ==========

  -- project_bookmaker_link_bonuses (via bookmaker_id)
  DELETE FROM project_bookmaker_link_bonuses WHERE bookmaker_id IN (
    SELECT id FROM bookmakers WHERE workspace_id = ANY(v_workspace_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('project_bookmaker_link_bonuses', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- transacoes_bookmakers
  DELETE FROM transacoes_bookmakers WHERE bookmaker_id IN (
    SELECT id FROM bookmakers WHERE workspace_id = ANY(v_workspace_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('transacoes_bookmakers', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- wallets_crypto
  DELETE FROM wallets_crypto WHERE parceiro_id IN (
    SELECT id FROM parceiros WHERE workspace_id = ANY(v_workspace_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('wallets_crypto', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- contas_bancarias
  DELETE FROM contas_bancarias WHERE parceiro_id IN (
    SELECT id FROM parceiros WHERE workspace_id = ANY(v_workspace_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('contas_bancarias', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- operadores_legado_pendente
  DELETE FROM operadores_legado_pendente WHERE operador_id IN (
    SELECT id FROM operadores WHERE workspace_id = ANY(v_workspace_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operadores_legado_pendente', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- ========== FASE 2: Novas tabelas de user_id ==========

  DELETE FROM project_favorites WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('project_favorites', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM login_history WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('login_history', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM moderation_logs WHERE moderator_user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('moderation_logs', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM user_influence_events WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_influence_events', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM user_influence_daily WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_influence_daily', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM user_influence_ranking WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_influence_ranking', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- ========== FASE 3: apostas_unificada (NOVA - substitui tabelas legadas) ==========

  DELETE FROM apostas_unificada WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('apostas_unificada', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- ========== FASE 4: Tabelas com user_id (entidades do usuário) ==========

  DELETE FROM freebets_recebidas WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('freebets_recebidas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM projeto_perdas WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projeto_perdas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM projeto_conciliacoes WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projeto_conciliacoes', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM projeto_ciclos WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projeto_ciclos', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM projeto_bookmaker_historico WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projeto_bookmaker_historico', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM entregas WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('entregas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM pagamentos_operador WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pagamentos_operador', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM pagamentos_propostos WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pagamentos_propostos', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM participacao_ciclos WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('participacao_ciclos', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM operador_projetos WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operador_projetos', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM investidor_deals WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('investidor_deals', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM movimentacoes_indicacao WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('movimentacoes_indicacao', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM promocao_participantes WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('promocao_participantes', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM promocoes_indicacao WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('promocoes_indicacao', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM indicacoes WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('indicacoes', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM indicador_acordos WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('indicador_acordos', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM parceiro_lucro_alertas WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('parceiro_lucro_alertas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM community_reports WHERE reporter_user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_reports', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM community_comments WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_comments', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM community_topics WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_topics', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM community_evaluations WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_evaluations', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM user_favorites WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_favorites', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- ========== FASE 5: Tabelas com workspace_id ==========

  DELETE FROM community_chat_messages WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_chat_messages', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM despesas_administrativas WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('despesas_administrativas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM cash_ledger WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('cash_ledger', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM parcerias WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('parcerias', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM indicadores_referral WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('indicadores_referral', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM fornecedores WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('fornecedores', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM investidores WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('investidores', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM operadores WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operadores', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM parceiros WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('parceiros', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM bookmakers WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('bookmakers', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM projetos WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projetos', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- ========== FASE 6: Novas tabelas de workspace ==========

  DELETE FROM workspace_invites WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('workspace_invites', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM billing_events WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('billing_events', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM subscription_changes WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('subscription_changes', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM workspace_subscriptions WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('workspace_subscriptions', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM bookmaker_unlinked_acks WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('bookmaker_unlinked_acks', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM exchange_adjustments WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('exchange_adjustments', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM sales_events WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('sales_events', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- ========== FASE 7: Vínculos de workspace ==========

  DELETE FROM user_permission_overrides WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_permission_overrides', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM bookmaker_workspace_access WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('bookmaker_workspace_access', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM workspace_members WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('workspace_members', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- ========== FASE 8: Workspaces ==========

  DELETE FROM workspaces WHERE id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('workspaces', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- ========== FASE 9: Limpar login_attempts e anonimizar profiles ==========

  DELETE FROM login_attempts WHERE email IN (
    SELECT email FROM profiles WHERE id = ANY(_user_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('login_attempts', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- Anonimizar profiles (soft delete)
  UPDATE profiles 
  SET 
    email = 'deleted_' || id::text || '@removed.local',
    full_name = 'Usuário Removido',
    is_blocked = true,
    blocked_at = now(),
    blocked_reason = 'Conta removida pelo sistema de limpeza',
    auth_version = auth_version + 1  -- Forçar relogin caso ainda logado
  WHERE id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles_anonymized', v_count);

  -- Registrar conclusão
  INSERT INTO audit_logs (workspace_id, actor_user_id, action, entity_type, entity_name, metadata)
  VALUES (
    get_user_workspace(auth.uid()),
    auth.uid(),
    'DELETE',
    'system_cleanup',
    'Limpeza de contas de teste',
    jsonb_build_object(
      'user_ids', _user_ids, 
      'workspace_ids', v_workspace_ids,
      'phase', 'completed',
      'total_deleted', v_total_deleted,
      'counts', v_deleted_counts
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Limpeza executada com sucesso',
    'total_records_affected', v_total_deleted,
    'deleted_counts', v_deleted_counts,
    'workspace_ids_removed', v_workspace_ids
  );
END;
$$;

-- 3. Atualizar admin_cleanup_system_owner_operational_data
CREATE OR REPLACE FUNCTION public.admin_cleanup_system_owner_operational_data(p_confirmation_phrase text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_owner_id uuid;
  v_workspace_id uuid;
  v_deleted_counts jsonb := '{}'::jsonb;
  v_count integer;
BEGIN
  IF p_confirmation_phrase != 'LIMPAR DADOS OPERACIONAIS' THEN
    RAISE EXCEPTION 'Frase de confirmação inválida';
  END IF;

  SELECT id INTO v_system_owner_id FROM profiles WHERE is_system_owner = true LIMIT 1;
  
  IF v_system_owner_id IS NULL THEN
    RAISE EXCEPTION 'System Owner não encontrado';
  END IF;
  
  IF auth.uid() != v_system_owner_id THEN
    RAISE EXCEPTION 'Apenas o System Owner pode executar esta operação';
  END IF;
  
  SELECT workspace_id INTO v_workspace_id
  FROM workspace_members
  WHERE user_id = v_system_owner_id AND role = 'owner'
  LIMIT 1;
  
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace do System Owner não encontrado';
  END IF;

  -- ========== FASE 1: Entidades folha ==========
  
  DELETE FROM project_bookmaker_link_bonuses 
  WHERE bookmaker_id IN (SELECT id FROM bookmakers WHERE workspace_id = v_workspace_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('project_bookmaker_link_bonuses', v_count);
  
  DELETE FROM transacoes_bookmakers 
  WHERE bookmaker_id IN (SELECT id FROM bookmakers WHERE workspace_id = v_workspace_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('transacoes_bookmakers', v_count);
  
  DELETE FROM wallets_crypto 
  WHERE parceiro_id IN (SELECT id FROM parceiros WHERE workspace_id = v_workspace_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('wallets_crypto', v_count);
  
  DELETE FROM contas_bancarias 
  WHERE parceiro_id IN (SELECT id FROM parceiros WHERE workspace_id = v_workspace_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('contas_bancarias', v_count);
  
  DELETE FROM operadores_legado_pendente 
  WHERE operador_id IN (SELECT id FROM operadores WHERE workspace_id = v_workspace_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operadores_legado_pendente', v_count);
  
  -- ========== FASE 2: apostas_unificada ==========
  
  DELETE FROM apostas_unificada WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('apostas_unificada', v_count);
  
  DELETE FROM freebets_recebidas WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('freebets_recebidas', v_count);
  
  -- ========== FASE 3: Entregas e Operador Projetos ==========
  
  DELETE FROM entregas WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('entregas', v_count);
  
  DELETE FROM operador_projetos 
  WHERE operador_id IN (SELECT id FROM operadores WHERE workspace_id = v_workspace_id)
     OR projeto_id IN (SELECT id FROM projetos WHERE workspace_id = v_workspace_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operador_projetos', v_count);
  
  -- ========== FASE 4: Projeto relacionados ==========
  
  DELETE FROM projeto_perdas WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projeto_perdas', v_count);
  
  DELETE FROM projeto_conciliacoes WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projeto_conciliacoes', v_count);
  
  DELETE FROM projeto_ciclos WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projeto_ciclos', v_count);
  
  DELETE FROM projeto_bookmaker_historico 
  WHERE bookmaker_id IN (SELECT id FROM bookmakers WHERE workspace_id = v_workspace_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projeto_bookmaker_historico', v_count);
  
  -- ========== FASE 5: Pagamentos ==========
  
  DELETE FROM pagamentos_operador WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pagamentos_operador', v_count);
  
  DELETE FROM pagamentos_propostos WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pagamentos_propostos', v_count);
  
  -- ========== FASE 6: Investidores ==========
  
  DELETE FROM participacao_ciclos WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('participacao_ciclos', v_count);
  
  DELETE FROM investidor_deals WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('investidor_deals', v_count);
  
  -- ========== FASE 7: Programa indicação ==========
  
  DELETE FROM movimentacoes_indicacao WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('movimentacoes_indicacao', v_count);
  
  DELETE FROM promocao_participantes WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('promocao_participantes', v_count);
  
  DELETE FROM promocoes_indicacao WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('promocoes_indicacao', v_count);
  
  DELETE FROM indicacoes WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('indicacoes', v_count);
  
  DELETE FROM indicador_acordos WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('indicador_acordos', v_count);
  
  -- ========== FASE 8: Alertas e favoritos ==========
  
  DELETE FROM parceiro_lucro_alertas WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('parceiro_lucro_alertas', v_count);
  
  DELETE FROM user_favorites WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_favorites', v_count);
  
  DELETE FROM project_favorites WHERE user_id = v_system_owner_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('project_favorites', v_count);
  
  -- ========== FASE 9: Financeiro ==========
  
  DELETE FROM cash_ledger WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('cash_ledger', v_count);
  
  DELETE FROM despesas_administrativas WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('despesas_administrativas', v_count);
  
  DELETE FROM exchange_adjustments WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('exchange_adjustments', v_count);
  
  -- ========== FASE 10: Entidades principais ==========
  
  DELETE FROM parcerias WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('parcerias', v_count);
  
  DELETE FROM bookmakers WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('bookmakers', v_count);
  
  DELETE FROM parceiros WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('parceiros', v_count);
  
  DELETE FROM projetos WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projetos', v_count);
  
  DELETE FROM operadores WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operadores', v_count);
  
  DELETE FROM investidores WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('investidores', v_count);
  
  DELETE FROM indicadores_referral WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('indicadores_referral', v_count);
  
  DELETE FROM fornecedores WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('fornecedores', v_count);
  
  -- ========== Registrar no audit log ==========
  INSERT INTO audit_logs (
    actor_user_id,
    workspace_id,
    action,
    entity_type,
    entity_name,
    metadata
  ) VALUES (
    v_system_owner_id,
    v_workspace_id,
    'DELETE',
    'system_cleanup',
    'Limpeza Operacional System Owner',
    jsonb_build_object(
      'deleted_counts', v_deleted_counts,
      'executed_at', now()
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_workspace_id,
    'deleted_counts', v_deleted_counts
  );
END;
$$;

-- 4. Atualizar admin_preview_system_owner_cleanup
CREATE OR REPLACE FUNCTION public.admin_preview_system_owner_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_owner_id uuid;
  v_workspace_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  SELECT id INTO v_system_owner_id FROM profiles WHERE is_system_owner = true LIMIT 1;
  
  IF v_system_owner_id IS NULL THEN
    RAISE EXCEPTION 'System Owner não encontrado';
  END IF;
  
  IF auth.uid() != v_system_owner_id THEN
    RAISE EXCEPTION 'Apenas o System Owner pode executar esta operação';
  END IF;
  
  SELECT workspace_id INTO v_workspace_id
  FROM workspace_members
  WHERE user_id = v_system_owner_id AND role = 'owner'
  LIMIT 1;
  
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace do System Owner não encontrado';
  END IF;
  
  v_result := jsonb_build_object(
    'workspace_id', v_workspace_id,
    'counts', jsonb_build_object(
      'parceiros', (SELECT COUNT(*) FROM parceiros WHERE workspace_id = v_workspace_id),
      'projetos', (SELECT COUNT(*) FROM projetos WHERE workspace_id = v_workspace_id),
      'operadores', (SELECT COUNT(*) FROM operadores WHERE workspace_id = v_workspace_id),
      'investidores', (SELECT COUNT(*) FROM investidores WHERE workspace_id = v_workspace_id),
      'bookmakers', (SELECT COUNT(*) FROM bookmakers WHERE workspace_id = v_workspace_id),
      'cash_ledger', (SELECT COUNT(*) FROM cash_ledger WHERE workspace_id = v_workspace_id),
      'despesas_administrativas', (SELECT COUNT(*) FROM despesas_administrativas WHERE workspace_id = v_workspace_id),
      'apostas_unificada', (SELECT COUNT(*) FROM apostas_unificada WHERE workspace_id = v_workspace_id),
      'freebets_recebidas', (SELECT COUNT(*) FROM freebets_recebidas WHERE workspace_id = v_workspace_id),
      'fornecedores', (SELECT COUNT(*) FROM fornecedores WHERE workspace_id = v_workspace_id),
      'indicadores_referral', (SELECT COUNT(*) FROM indicadores_referral WHERE workspace_id = v_workspace_id),
      'parcerias', (SELECT COUNT(*) FROM parcerias WHERE workspace_id = v_workspace_id),
      'entregas', (SELECT COUNT(*) FROM entregas WHERE workspace_id = v_workspace_id),
      'project_bookmaker_link_bonuses', (
        SELECT COUNT(*) FROM project_bookmaker_link_bonuses 
        WHERE bookmaker_id IN (SELECT id FROM bookmakers WHERE workspace_id = v_workspace_id)
      ),
      'exchange_adjustments', (SELECT COUNT(*) FROM exchange_adjustments WHERE workspace_id = v_workspace_id)
    )
  );
  
  RETURN v_result;
END;
$$;