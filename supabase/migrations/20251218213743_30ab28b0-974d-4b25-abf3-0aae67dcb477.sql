-- =============================================
-- REFATORAÇÃO: Limpeza Workspace-Centric
-- =============================================

-- Drop existing functions to recreate
DROP FUNCTION IF EXISTS public.admin_cleanup_dry_run(uuid[]);
DROP FUNCTION IF EXISTS public.admin_execute_cleanup(uuid[], text);

-- =============================================
-- Função auxiliar: Verificar se coluna existe
-- =============================================
CREATE OR REPLACE FUNCTION public.column_exists(_table_name text, _column_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = _table_name 
      AND column_name = _column_name
  )
$$;

-- =============================================
-- DRY-RUN: Workspace-Centric
-- =============================================
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

  -- =============================================
  -- LÓGICA WORKSPACE-FIRST
  -- Identificar TODOS os workspaces dos usuários (owner OU member)
  -- =============================================
  SELECT ARRAY_AGG(DISTINCT wm.workspace_id) INTO v_workspace_ids
  FROM workspace_members wm
  WHERE wm.user_id = ANY(_user_ids);

  -- Se não encontrou workspaces, array vazio
  v_workspace_ids := COALESCE(v_workspace_ids, '{}'::uuid[]);

  -- Contar workspaces
  v_workspaces_count := COALESCE(array_length(v_workspace_ids, 1), 0);

  -- =============================================
  -- CONTAGEM POR TABELA (workspace-first)
  -- =============================================
  SELECT jsonb_build_object(
    -- Tabelas com workspace_id
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
    
    -- Tabelas com user_id (entidades de usuário)
    'apostas', (SELECT COUNT(*) FROM apostas WHERE user_id = ANY(_user_ids)),
    'apostas_multiplas', (SELECT COUNT(*) FROM apostas_multiplas WHERE user_id = ANY(_user_ids)),
    'surebets', (SELECT COUNT(*) FROM surebets WHERE user_id = ANY(_user_ids)),
    'freebets_recebidas', (SELECT COUNT(*) FROM freebets_recebidas WHERE user_id = ANY(_user_ids)),
    'projeto_perdas', (SELECT COUNT(*) FROM projeto_perdas WHERE user_id = ANY(_user_ids)),
    'projeto_conciliacoes', (SELECT COUNT(*) FROM projeto_conciliacoes WHERE user_id = ANY(_user_ids)),
    'projeto_ciclos', (SELECT COUNT(*) FROM projeto_ciclos WHERE user_id = ANY(_user_ids)),
    'projeto_bookmaker_historico', (SELECT COUNT(*) FROM projeto_bookmaker_historico WHERE user_id = ANY(_user_ids)),
    'entregas', (SELECT COUNT(*) FROM entregas WHERE user_id = ANY(_user_ids)),
    'pagamentos_operador', (SELECT COUNT(*) FROM pagamentos_operador WHERE user_id = ANY(_user_ids)),
    'pagamentos_propostos', (SELECT COUNT(*) FROM pagamentos_propostos WHERE user_id = ANY(_user_ids)),
    'participacao_ciclos', (SELECT COUNT(*) FROM participacao_ciclos WHERE user_id = ANY(_user_ids)),
    'operador_projetos', (SELECT COUNT(*) FROM operador_projetos WHERE user_id = ANY(_user_ids)),
    'matched_betting_rounds', (SELECT COUNT(*) FROM matched_betting_rounds WHERE user_id = ANY(_user_ids)),
    'matched_betting_promocoes', (SELECT COUNT(*) FROM matched_betting_promocoes WHERE user_id = ANY(_user_ids)),
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
    
    -- Tabelas vinculadas via JOINs (sem user_id ou workspace_id direto)
    'matched_betting_pernas', (
      SELECT COUNT(*) FROM matched_betting_pernas 
      WHERE round_id IN (SELECT id FROM matched_betting_rounds WHERE user_id = ANY(_user_ids))
    ),
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
    
    -- Workspace-level entities
    'workspace_members', (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ANY(v_workspace_ids)),
    'user_permission_overrides', (SELECT COUNT(*) FROM user_permission_overrides WHERE workspace_id = ANY(v_workspace_ids)),
    'bookmaker_workspace_access', (SELECT COUNT(*) FROM bookmaker_workspace_access WHERE workspace_id = ANY(v_workspace_ids)),
    'community_reports', (SELECT COUNT(*) FROM community_reports WHERE reporter_user_id = ANY(_user_ids))
  ) INTO v_counts;

  -- Montar resultado
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

-- =============================================
-- EXECUTE CLEANUP: Workspace-Centric
-- =============================================
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
  -- Verificar se caller é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  -- Verificar frase de confirmação
  IF _confirmation_phrase != 'CONFIRMAR LIMPEZA DEFINITIVA' THEN
    RAISE EXCEPTION 'Confirmation phrase does not match';
  END IF;

  -- Não permitir limpar o próprio system owner
  IF auth.uid() = ANY(_user_ids) THEN
    RAISE EXCEPTION 'Cannot cleanup your own account';
  END IF;

  -- Verificar se algum dos usuários é system owner
  IF EXISTS (SELECT 1 FROM profiles WHERE id = ANY(_user_ids) AND is_system_owner = true) THEN
    RAISE EXCEPTION 'Cannot cleanup system owner accounts';
  END IF;

  -- Registrar início da limpeza no audit_logs
  INSERT INTO audit_logs (workspace_id, actor_user_id, action, entity_type, entity_name, metadata)
  VALUES (
    get_user_workspace(auth.uid()),
    auth.uid(),
    'DELETE',
    'system_cleanup',
    'Limpeza de contas de teste',
    jsonb_build_object('user_ids', _user_ids, 'phase', 'started')
  );

  -- =============================================
  -- LÓGICA WORKSPACE-FIRST
  -- =============================================
  SELECT ARRAY_AGG(DISTINCT wm.workspace_id) INTO v_workspace_ids
  FROM workspace_members wm
  WHERE wm.user_id = ANY(_user_ids);

  v_workspace_ids := COALESCE(v_workspace_ids, '{}'::uuid[]);
  v_deleted_counts := '{}'::jsonb;

  -- ========================
  -- FASE 1: Entidades folha (dependem de outras via FK)
  -- ========================

  -- matched_betting_pernas (via round_id)
  DELETE FROM matched_betting_pernas WHERE round_id IN (
    SELECT id FROM matched_betting_rounds WHERE user_id = ANY(_user_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('matched_betting_pernas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- transacoes_bookmakers (via bookmaker_id -> bookmakers -> workspace_id)
  DELETE FROM transacoes_bookmakers WHERE bookmaker_id IN (
    SELECT id FROM bookmakers WHERE workspace_id = ANY(v_workspace_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('transacoes_bookmakers', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- wallets_crypto (via parceiro_id -> parceiros -> workspace_id)
  DELETE FROM wallets_crypto WHERE parceiro_id IN (
    SELECT id FROM parceiros WHERE workspace_id = ANY(v_workspace_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('wallets_crypto', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- contas_bancarias (via parceiro_id -> parceiros -> workspace_id)
  DELETE FROM contas_bancarias WHERE parceiro_id IN (
    SELECT id FROM parceiros WHERE workspace_id = ANY(v_workspace_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('contas_bancarias', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- operadores_legado_pendente (via operador_id -> operadores -> workspace_id)
  DELETE FROM operadores_legado_pendente WHERE operador_id IN (
    SELECT id FROM operadores WHERE workspace_id = ANY(v_workspace_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operadores_legado_pendente', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- ========================
  -- FASE 2: Entidades com user_id (ações do usuário)
  -- ========================

  DELETE FROM matched_betting_rounds WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('matched_betting_rounds', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM matched_betting_promocoes WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('matched_betting_promocoes', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM apostas WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('apostas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM apostas_multiplas WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('apostas_multiplas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM surebets WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('surebets', v_count);
  v_total_deleted := v_total_deleted + v_count;

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

  -- ========================
  -- FASE 3: Entidades com workspace_id
  -- ========================

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

  -- ========================
  -- FASE 4: Vínculos de workspace
  -- ========================

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

  -- ========================
  -- FASE 5: Workspaces
  -- ========================

  DELETE FROM workspaces WHERE id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('workspaces', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- ========================
  -- FASE 6: Limpar login_attempts e anonimizar profiles
  -- ========================

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
    blocked_reason = 'Conta removida pelo sistema de limpeza'
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