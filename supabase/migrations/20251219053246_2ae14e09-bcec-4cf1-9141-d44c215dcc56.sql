-- Fix: usar 'DELETE' maiúsculo no enum audit_action
CREATE OR REPLACE FUNCTION public.admin_cleanup_system_owner_operational_data(
  p_confirmation_phrase text
)
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
  -- Validar frase de confirmação
  IF p_confirmation_phrase != 'LIMPAR DADOS OPERACIONAIS' THEN
    RAISE EXCEPTION 'Frase de confirmação inválida';
  END IF;

  -- Obter o System Owner
  SELECT id INTO v_system_owner_id
  FROM profiles
  WHERE is_system_owner = true
  LIMIT 1;
  
  IF v_system_owner_id IS NULL THEN
    RAISE EXCEPTION 'System Owner não encontrado';
  END IF;
  
  -- Verificar se quem está executando é o System Owner
  IF auth.uid() != v_system_owner_id THEN
    RAISE EXCEPTION 'Apenas o System Owner pode executar esta operação';
  END IF;
  
  -- Obter workspace do System Owner
  SELECT workspace_id INTO v_workspace_id
  FROM workspace_members
  WHERE user_id = v_system_owner_id AND role = 'owner'
  LIMIT 1;
  
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace do System Owner não encontrado';
  END IF;

  -- ========== FASE 1: Entidades folha (mais dependentes) ==========
  
  DELETE FROM matched_betting_pernas 
  WHERE round_id IN (SELECT id FROM matched_betting_rounds WHERE workspace_id = v_workspace_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('matched_betting_pernas', v_count);
  
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
  
  -- ========== FASE 2: Entregas e Operador Projetos ==========
  
  DELETE FROM entregas WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('entregas', v_count);
  
  DELETE FROM operador_projetos 
  WHERE operador_id IN (SELECT id FROM operadores WHERE workspace_id = v_workspace_id)
     OR projeto_id IN (SELECT id FROM projetos WHERE workspace_id = v_workspace_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operador_projetos', v_count);
  
  -- ========== FASE 3: Matched Betting ==========
  
  DELETE FROM matched_betting_rounds WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('matched_betting_rounds', v_count);
  
  DELETE FROM matched_betting_promocoes WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('matched_betting_promocoes', v_count);
  
  -- ========== FASE 4: Apostas e relacionados ==========
  
  DELETE FROM apostas WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('apostas', v_count);
  
  DELETE FROM apostas_multiplas WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('apostas_multiplas', v_count);
  
  DELETE FROM surebets WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('surebets', v_count);
  
  DELETE FROM freebets_recebidas WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('freebets_recebidas', v_count);
  
  -- ========== FASE 5: Projeto relacionados ==========
  
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
  
  -- ========== FASE 6: Pagamentos ==========
  
  DELETE FROM pagamentos_operador WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pagamentos_operador', v_count);
  
  DELETE FROM pagamentos_propostos WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('pagamentos_propostos', v_count);
  
  -- ========== FASE 7: Investidores relacionados ==========
  
  DELETE FROM participacao_ciclos WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('participacao_ciclos', v_count);
  
  DELETE FROM investidor_deals WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('investidor_deals', v_count);
  
  -- ========== FASE 8: Programa indicação ==========
  
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
  
  -- ========== FASE 9: Alertas e favoritos ==========
  
  DELETE FROM parceiro_lucro_alertas WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('parceiro_lucro_alertas', v_count);
  
  DELETE FROM user_favorites WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_favorites', v_count);
  
  -- ========== FASE 10: Financeiro ==========
  
  DELETE FROM cash_ledger WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('cash_ledger', v_count);
  
  DELETE FROM despesas_administrativas WHERE workspace_id = v_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('despesas_administrativas', v_count);
  
  -- ========== FASE 11: Entidades principais ==========
  
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
  
  -- ========== Registrar no audit log (usando 'DELETE' maiúsculo) ==========
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