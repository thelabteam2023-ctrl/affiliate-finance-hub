
CREATE OR REPLACE FUNCTION public.test_link_simulation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws_id uuid := 'f0b97bc3-7103-4225-a352-5fbc1c9188d8';
  v_user_id uuid := 'b75d8d25-44fc-4bbb-8cf9-e9ae9e5b23b7';
  v_proj_a uuid := 'adccc507-8cec-466d-9937-ac3695ed886b';
  v_proj_b uuid := '67f64eec-79ba-479f-b2ca-848c265977fe';
  v_test_bk_id uuid;
  v_deposit_id uuid;
  v_deposit_id2 uuid;
  v_snapshot uuid;
  v_count integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  -- Create test bookmaker
  INSERT INTO bookmakers (
    nome, workspace_id, user_id, moeda, saldo_atual, saldo_freebet,
    login_username, login_password_encrypted, status, projeto_id, saldo_irrecuperavel, saldo_usd
  ) VALUES (
    'TEST_SIM_' || extract(epoch from now())::text, v_ws_id, v_user_id, 'BRL', 500.00, 0,
    'test_sim', 'test_sim', 'ativo', NULL, 0, 0
  ) RETURNING id INTO v_test_bk_id;

  -- ========== CENÁRIO 1: Vinculação simples ==========
  UPDATE bookmakers SET projeto_id = v_proj_a WHERE id = v_test_bk_id;

  SELECT COUNT(*) INTO v_count FROM cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL' AND destino_bookmaker_id = v_test_bk_id AND projeto_id_snapshot = v_proj_a;

  v_results := v_results || jsonb_build_object(
    'test', 'C1_DV_criado_ao_vincular',
    'passed', v_count = 1,
    'expected', 1, 'got', v_count
  );

  -- Depósito real durante Projeto A
  INSERT INTO cash_ledger (
    workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
    valor, destino_bookmaker_id, destino_tipo,
    status, data_transacao, impacta_caixa_operacional
  ) VALUES (
    v_ws_id, v_user_id, 'DEPOSITO', 'FIAT', 'BRL',
    200.00, v_test_bk_id, 'BOOKMAKER',
    'CONFIRMADO', CURRENT_DATE, true
  ) RETURNING id INTO v_deposit_id;

  SELECT projeto_id_snapshot INTO v_snapshot FROM cash_ledger WHERE id = v_deposit_id;
  v_results := v_results || jsonb_build_object(
    'test', 'C1_deposito_recebe_snapshot_automatico',
    'passed', v_snapshot = v_proj_a,
    'expected', v_proj_a::text, 'got', COALESCE(v_snapshot::text, 'NULL')
  );

  -- ========== CENÁRIO 2: Desvincular → Vincular B ==========
  -- SV para Projeto A
  INSERT INTO cash_ledger (
    workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
    valor, origem_bookmaker_id, origem_tipo,
    status, data_transacao, projeto_id_snapshot, impacta_caixa_operacional, descricao
  ) VALUES (
    v_ws_id, v_user_id, 'SAQUE_VIRTUAL', 'FIAT', 'BRL',
    700.00, v_test_bk_id, 'BOOKMAKER',
    'CONFIRMADO', CURRENT_DATE, v_proj_a, false, 'SV sim1'
  );
  UPDATE bookmakers SET projeto_id = NULL WHERE id = v_test_bk_id;

  -- Vincular ao Projeto B
  UPDATE bookmakers SET projeto_id = v_proj_b WHERE id = v_test_bk_id;

  -- Depósito R$200 NÃO deve ter sido herdado por B
  SELECT projeto_id_snapshot INTO v_snapshot FROM cash_ledger WHERE id = v_deposit_id;
  v_results := v_results || jsonb_build_object(
    'test', 'C2_deposito_NAO_herdado_por_novo_projeto',
    'passed', v_snapshot IS DISTINCT FROM v_proj_b,
    'expected', 'NOT ' || v_proj_b::text, 'got', COALESCE(v_snapshot::text, 'NULL')
  );

  -- Nenhum depósito REAL no Projeto B
  SELECT COUNT(*) INTO v_count FROM cash_ledger
  WHERE tipo_transacao = 'DEPOSITO' AND destino_bookmaker_id = v_test_bk_id AND projeto_id_snapshot = v_proj_b;
  v_results := v_results || jsonb_build_object(
    'test', 'C2_zero_depositos_reais_projeto_B',
    'passed', v_count = 0,
    'expected', 0, 'got', v_count
  );

  -- ========== CENÁRIO 3: Retorno ao Projeto A (A→B→A) ==========
  INSERT INTO cash_ledger (
    workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
    valor, origem_bookmaker_id, origem_tipo,
    status, data_transacao, projeto_id_snapshot, impacta_caixa_operacional, descricao
  ) VALUES (
    v_ws_id, v_user_id, 'SAQUE_VIRTUAL', 'FIAT', 'BRL',
    700.00, v_test_bk_id, 'BOOKMAKER',
    'CONFIRMADO', CURRENT_DATE, v_proj_b, false, 'SV sim2'
  );
  UPDATE bookmakers SET projeto_id = NULL WHERE id = v_test_bk_id;
  UPDATE bookmakers SET projeto_id = v_proj_a WHERE id = v_test_bk_id;

  -- Depósito original deve ter sido LIMPO (PREVIOUS_CYCLE_CLEAR)
  SELECT projeto_id_snapshot INTO v_snapshot FROM cash_ledger WHERE id = v_deposit_id;
  v_results := v_results || jsonb_build_object(
    'test', 'C3_deposito_antigo_limpo_ao_retornar',
    'passed', v_snapshot IS NULL,
    'expected', 'NULL', 'got', COALESCE(v_snapshot::text, 'NULL')
  );

  -- Zero depósitos reais no novo ciclo do Projeto A
  SELECT COUNT(*) INTO v_count FROM cash_ledger
  WHERE tipo_transacao = 'DEPOSITO' AND destino_bookmaker_id = v_test_bk_id AND projeto_id_snapshot = v_proj_a;
  v_results := v_results || jsonb_build_object(
    'test', 'C3_zero_depositos_reais_novo_ciclo_A',
    'passed', v_count = 0,
    'expected', 0, 'got', v_count
  );

  -- ========== CENÁRIO 4: Depósito órfão entre projetos ==========
  INSERT INTO cash_ledger (
    workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
    valor, origem_bookmaker_id, origem_tipo,
    status, data_transacao, projeto_id_snapshot, impacta_caixa_operacional, descricao
  ) VALUES (
    v_ws_id, v_user_id, 'SAQUE_VIRTUAL', 'FIAT', 'BRL',
    700.00, v_test_bk_id, 'BOOKMAKER',
    'CONFIRMADO', CURRENT_DATE, v_proj_a, false, 'SV sim3'
  );
  UPDATE bookmakers SET projeto_id = NULL WHERE id = v_test_bk_id;

  -- Depósito enquanto desvinculada
  INSERT INTO cash_ledger (
    workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
    valor, destino_bookmaker_id, destino_tipo,
    status, data_transacao, impacta_caixa_operacional
  ) VALUES (
    v_ws_id, v_user_id, 'DEPOSITO', 'FIAT', 'BRL',
    300.00, v_test_bk_id, 'BOOKMAKER',
    'CONFIRMADO', CURRENT_DATE, true
  ) RETURNING id INTO v_deposit_id2;

  SELECT projeto_id_snapshot INTO v_snapshot FROM cash_ledger WHERE id = v_deposit_id2;
  v_results := v_results || jsonb_build_object(
    'test', 'C4_deposito_orfao_sem_snapshot',
    'passed', v_snapshot IS NULL,
    'expected', 'NULL', 'got', COALESCE(v_snapshot::text, 'NULL')
  );

  -- Vincular ao Projeto B → órfão deve ser adotado
  UPDATE bookmakers SET projeto_id = v_proj_b WHERE id = v_test_bk_id;

  SELECT projeto_id_snapshot INTO v_snapshot FROM cash_ledger WHERE id = v_deposit_id2;
  v_results := v_results || jsonb_build_object(
    'test', 'C4_orfao_adotado_pelo_novo_projeto',
    'passed', v_snapshot = v_proj_b,
    'expected', v_proj_b::text, 'got', COALESCE(v_snapshot::text, 'NULL')
  );

  -- ========== CLEANUP ==========
  DELETE FROM cash_ledger WHERE destino_bookmaker_id = v_test_bk_id OR origem_bookmaker_id = v_test_bk_id;
  DELETE FROM financial_debug_log WHERE bookmaker_id = v_test_bk_id;
  DELETE FROM bookmaker_balance_audit WHERE bookmaker_id = v_test_bk_id;
  DELETE FROM financial_events WHERE bookmaker_id = v_test_bk_id;
  DELETE FROM bookmakers WHERE id = v_test_bk_id;

  RETURN jsonb_build_object('tests', v_results, 'bookmaker_id', v_test_bk_id);
END;
$$;
