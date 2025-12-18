-- Fix the admin_execute_cleanup function to use correct enum value 'DELETE' instead of 'delete'
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

  -- Registrar início da limpeza no audit_logs (using uppercase DELETE)
  INSERT INTO audit_logs (workspace_id, actor_user_id, action, entity_type, entity_name, metadata)
  VALUES (
    get_user_workspace(auth.uid()),
    auth.uid(),
    'DELETE',
    'system_cleanup',
    'Limpeza de contas de teste',
    jsonb_build_object('user_ids', _user_ids, 'phase', 'started')
  );

  -- Identificar workspaces dos usuários (onde são owners)
  SELECT ARRAY_AGG(DISTINCT wm.workspace_id) INTO v_workspace_ids
  FROM workspace_members wm
  WHERE wm.user_id = ANY(_user_ids) AND wm.role = 'owner';

  v_deleted_counts := '{}'::jsonb;

  -- ========================
  -- DELETAR EM ORDEM DE DEPENDÊNCIA (folhas primeiro)
  -- ========================

  -- 1. Matched Betting (pernas dependem de rounds)
  DELETE FROM matched_betting_pernas WHERE round_id IN (
    SELECT id FROM matched_betting_rounds WHERE user_id = ANY(_user_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('matched_betting_pernas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM matched_betting_rounds WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('matched_betting_rounds', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM matched_betting_promocoes WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('matched_betting_promocoes', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 2. Surebets e apostas relacionadas
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

  -- 3. Projeto relacionados
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

  -- 4. Operadores e entregas
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

  DELETE FROM operadores WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operadores', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM operadores_legado_pendente WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operadores_legado_pendente', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 5. Transações de bookmaker
  DELETE FROM transacoes_bookmakers WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('transacoes_bookmakers', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 6. Bookmakers
  DELETE FROM bookmakers WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('bookmakers', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 7. Projetos
  DELETE FROM projetos WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projetos', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 8. Investidores
  DELETE FROM investidor_deals WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('investidor_deals', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM investidores WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('investidores', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 9. Parcerias e Indicações
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

  DELETE FROM indicadores_referral WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('indicadores_referral', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM parcerias WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('parcerias', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 10. Fornecedores
  DELETE FROM fornecedores WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('fornecedores', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 11. Parceiros (contas bancárias, wallets, alertas)
  DELETE FROM parceiro_lucro_alertas WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('parceiro_lucro_alertas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- Wallets (precisam do parceiro_id)
  DELETE FROM wallets_crypto WHERE parceiro_id IN (
    SELECT id FROM parceiros WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('wallets_crypto', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- Contas bancárias
  DELETE FROM contas_bancarias WHERE parceiro_id IN (
    SELECT id FROM parceiros WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('contas_bancarias', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM parceiros WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('parceiros', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 12. Caixa e despesas
  DELETE FROM cash_ledger WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('cash_ledger', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM despesas_administrativas WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('despesas_administrativas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 13. Comunidade
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

  DELETE FROM community_chat_messages WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_chat_messages', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 14. Permissões e favoritos
  DELETE FROM user_permission_overrides WHERE user_id = ANY(_user_ids) OR workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_permission_overrides', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM user_favorites WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_favorites', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM user_roles WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_roles', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 15. Login attempts
  DELETE FROM login_attempts WHERE email IN (
    SELECT email FROM profiles WHERE id = ANY(_user_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('login_attempts', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 16. Bancos e redes customizadas (não system)
  DELETE FROM bancos WHERE user_id = ANY(_user_ids) AND is_system = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('bancos', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM redes_crypto WHERE user_id = ANY(_user_ids) AND is_system = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('redes_crypto', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 17. Bookmaker workspace access
  DELETE FROM bookmaker_workspace_access WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('bookmaker_workspace_access', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 18. Workspace members
  DELETE FROM workspace_members WHERE workspace_id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('workspace_members', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 19. Workspaces
  DELETE FROM workspaces WHERE id = ANY(v_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('workspaces', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- 20. Profiles (soft delete - anonimizar em vez de deletar)
  UPDATE profiles 
  SET 
    email = 'deleted_' || id::text || '@removed.local',
    full_name = 'Usuário Removido',
    is_blocked = true,
    blocked_at = now(),
    blocked_reason = 'Conta removida via limpeza de sistema'
  WHERE id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles_anonymized', v_count);

  -- Registrar conclusão da limpeza (using uppercase DELETE)
  INSERT INTO audit_logs (workspace_id, actor_user_id, action, entity_type, entity_name, metadata)
  VALUES (
    get_user_workspace(auth.uid()),
    auth.uid(),
    'DELETE',
    'system_cleanup',
    'Limpeza de contas de teste',
    jsonb_build_object(
      'user_ids', _user_ids, 
      'phase', 'completed',
      'total_deleted', v_total_deleted,
      'counts', v_deleted_counts
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'total_records_affected', v_total_deleted,
    'workspace_ids_removed', v_workspace_ids,
    'details', v_deleted_counts
  );
END;
$$;