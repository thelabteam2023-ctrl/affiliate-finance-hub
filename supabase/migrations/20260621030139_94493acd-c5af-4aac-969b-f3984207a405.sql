
-- ============================================================
-- FASE 3 — Testes controlados de surebet (LAY) e edição liquidada
-- ============================================================

CREATE TABLE IF NOT EXISTS public.__phase3_test_report (
  id SERIAL PRIMARY KEY,
  cenario TEXT,
  etapa TEXT,
  esperado TEXT,
  observado TEXT,
  status TEXT,
  detalhes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.__phase3_test_report TO service_role;

TRUNCATE public.__phase3_test_report;

DO $TEST$
DECLARE
  v_ws UUID := 'f8b6f7ce-92b9-4d26-899a-0f0eeb1324cd';
  v_user UUID := 'b75d8d25-44fc-4bbb-8cf9-e9ae9e5b23b7';
  v_proj UUID := 'de516746-af6e-4ff9-bc2f-43e51bd16364';
  v_bk_a UUID; v_bk_b UUID;
  v_surebet_id UUID;
  v_perna_back_id UUID; v_perna_lay_id UUID;
  v_simple_id UUID;
  v_stake_back NUMERIC := 100;
  v_odd_back NUMERIC := 2.00;
  v_stake_lay NUMERIC := 96.53;
  v_odd_lay NUMERIC := 2.10;
  v_comissao_lay NUMERIC := 0.028;
  v_liability_esperada NUMERIC;
  v_debito_back NUMERIC; v_debito_lay NUMERIC;
  v_payout_back NUMERIC; v_payout_lay NUMERIC; v_refund_lay NUMERIC;
  v_lucro_pai NUMERIC;
  v_payout_simples_antigo NUMERIC; v_payout_simples_novo NUMERIC;
  v_stake_simples_antigo NUMERIC; v_stake_simples_novo NUMERIC;
  v_reversal_count INTEGER;
  v_rpc JSONB;
  v_edit JSONB;
  v_create RECORD;
  v_lucro_realizado NUMERIC;
BEGIN
  v_liability_esperada := ROUND(v_stake_lay * (v_odd_lay - 1), 3);

  -- ============================================================
  -- SETUP — bookmakers de teste
  -- ============================================================
  INSERT INTO public.bookmakers (
    user_id, workspace_id, nome, login_username, login_password_encrypted,
    saldo_atual, moeda, status, projeto_id
  ) VALUES
    (v_user, v_ws, '__T_BK_A__', 't', 't', 1000, 'BRL', 'ativo', v_proj)
  RETURNING id INTO v_bk_a;

  INSERT INTO public.bookmakers (
    user_id, workspace_id, nome, login_username, login_password_encrypted,
    saldo_atual, moeda, status, projeto_id
  ) VALUES
    (v_user, v_ws, '__T_BK_B__', 't', 't', 1000, 'BRL', 'ativo', v_proj)
  RETURNING id INTO v_bk_b;

  -- vínculo bookmaker × projeto (alguns triggers olham aqui)
  INSERT INTO public.projeto_bookmaker_historico (
    user_id, workspace_id, projeto_id, bookmaker_id, bookmaker_nome, status_final, data_vinculacao
  ) VALUES
    (v_user, v_ws, v_proj, v_bk_a, '__T_BK_A__', 'ATIVO', now()),
    (v_user, v_ws, v_proj, v_bk_b, '__T_BK_B__', 'ATIVO', now());

  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('SETUP','bookmakers criados','2','2','OK',
    jsonb_build_object('bk_a', v_bk_a, 'bk_b', v_bk_b));

  -- ============================================================
  -- CENÁRIO 1 — Criação de surebet BACK + LAY
  -- ============================================================
  SELECT * INTO v_create FROM public.criar_surebet_atomica_v3(
    v_ws, v_user, v_proj,
    '__T_EVENTO__', 'Futebol', '1X2', 'NORMAL', 'SUREBET', 'NORMAL',
    now()::text,
    -- pernas
    jsonb_build_array(
      jsonb_build_object('ordem', 1, 'casa_id', v_bk_a, 'selecao', 'Casa', 'tipo', 'back'),
      jsonb_build_object('ordem', 2, 'casa_id', v_bk_b, 'selecao', 'Fora', 'tipo', 'lay', 'comissao', v_comissao_lay)
    ),
    -- entradas (uma por perna)
    jsonb_build_array(
      jsonb_build_object('perna_ordem', 1, 'bookmaker_id', v_bk_a,
        'stake', v_stake_back, 'odd', v_odd_back, 'moeda','BRL',
        'fonte_saldo','REAL', 'cotacao_snapshot', 1, 'stake_brl_referencia', v_stake_back,
        'tipo','back'),
      jsonb_build_object('perna_ordem', 2, 'bookmaker_id', v_bk_b,
        'stake', v_stake_lay, 'odd', v_odd_lay, 'moeda','BRL',
        'fonte_saldo','REAL', 'cotacao_snapshot', 1, 'stake_brl_referencia', v_stake_lay,
        'tipo','lay', 'comissao', v_comissao_lay)
    )
  );

  v_surebet_id := v_create.o_aposta_id;

  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T1-criacao', 'criar_surebet_atomica_v3', 'success=true',
    'success=' || COALESCE(v_create.success::text, 'NULL'),
    CASE WHEN v_create.success THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('surebet_id', v_surebet_id, 'msg', v_create.message));

  SELECT id INTO v_perna_back_id FROM public.apostas_pernas WHERE aposta_id=v_surebet_id AND tipo='back';
  SELECT id INTO v_perna_lay_id  FROM public.apostas_pernas WHERE aposta_id=v_surebet_id AND tipo='lay';

  -- T1.a: débito BACK = -stake
  SELECT valor INTO v_debito_back FROM public.financial_events
   WHERE aposta_id=v_surebet_id AND bookmaker_id=v_bk_a AND tipo_evento='STAKE' AND reversed_event_id IS NULL LIMIT 1;
  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T1-criacao', 'debito BACK', (-v_stake_back)::text, v_debito_back::text,
    CASE WHEN ROUND(v_debito_back::numeric,3) = ROUND((-v_stake_back)::numeric,3) THEN 'PASS' ELSE 'FAIL' END,
    NULL);

  -- T1.b: débito LAY = -liability (não -stake)
  SELECT valor INTO v_debito_lay FROM public.financial_events
   WHERE aposta_id=v_surebet_id AND bookmaker_id=v_bk_b AND tipo_evento='STAKE' AND reversed_event_id IS NULL LIMIT 1;
  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T1-criacao', 'debito LAY = -liability', (-v_liability_esperada)::text, v_debito_lay::text,
    CASE WHEN ROUND(v_debito_lay::numeric,3) = ROUND((-v_liability_esperada)::numeric,3) THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('liability_esperada', v_liability_esperada,
                       'erro_se_fosse_stake', -v_stake_lay));

  -- ============================================================
  -- CENÁRIO 2 — Liquidação perna a perna (BACK RED + LAY GREEN)
  -- Equivale ao botão "Liquidar > LAY ganha" do menu de Surebet.
  -- ============================================================
  v_rpc := public.liquidar_perna_surebet_v1(v_perna_back_id, 'RED', v_ws);
  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T3-perna_a_perna', 'liquidar BACK RED', 'success=true',
    COALESCE(v_rpc->>'success','null'),
    CASE WHEN (v_rpc->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END,
    v_rpc);

  v_rpc := public.liquidar_perna_surebet_v1(v_perna_lay_id, 'GREEN', v_ws);
  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T3-perna_a_perna', 'liquidar LAY GREEN', 'success=true',
    COALESCE(v_rpc->>'success','null'),
    CASE WHEN (v_rpc->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END,
    v_rpc);

  -- T3.a: BACK RED → nenhum PAYOUT positivo (stake já debitado, fim)
  SELECT COALESCE(SUM(valor),0) INTO v_payout_back
  FROM public.financial_events
  WHERE aposta_id=v_surebet_id AND bookmaker_id=v_bk_a
    AND tipo_evento IN ('PAYOUT','VOID_REFUND') AND reversed_event_id IS NULL;
  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T3-perna_a_perna', 'PAYOUT BACK RED = 0', '0', v_payout_back::text,
    CASE WHEN v_payout_back = 0 THEN 'PASS' ELSE 'FAIL' END, NULL);

  -- T3.b: LAY GREEN → PAYOUT = stake*(1-comissao);  VOID_REFUND (libera liability) = liability
  SELECT COALESCE(SUM(valor) FILTER (WHERE tipo_evento='PAYOUT'),0),
         COALESCE(SUM(valor) FILTER (WHERE tipo_evento='VOID_REFUND'),0)
    INTO v_payout_lay, v_refund_lay
  FROM public.financial_events
  WHERE aposta_id=v_surebet_id AND bookmaker_id=v_bk_b
    AND tipo_evento IN ('PAYOUT','VOID_REFUND') AND reversed_event_id IS NULL;

  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T3-perna_a_perna', 'PAYOUT LAY GREEN = stake*(1-comissao)',
    ROUND(v_stake_lay*(1-v_comissao_lay),3)::text, ROUND(v_payout_lay::numeric,3)::text,
    CASE WHEN ROUND(v_payout_lay::numeric,2) = ROUND((v_stake_lay*(1-v_comissao_lay))::numeric,2)
         THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('payout_lay', v_payout_lay, 'refund_lay_liberty', v_refund_lay));

  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T3-perna_a_perna', 'VOID_REFUND LAY libera liability',
    v_liability_esperada::text, ROUND(v_refund_lay::numeric,3)::text,
    CASE WHEN ROUND(v_refund_lay::numeric,2) = ROUND(v_liability_esperada::numeric,2)
         THEN 'PASS' ELSE 'FAIL' END, NULL);

  -- T3.c: lucro do pai (recalc por fn_recalc_pai_surebet)
  SELECT lucro_prejuizo INTO v_lucro_pai FROM public.apostas_unificada WHERE id=v_surebet_id;
  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T3-perna_a_perna', 'lucro pai = -stake_back + stake_lay*(1-comissao)',
    ROUND((-v_stake_back + v_stake_lay*(1-v_comissao_lay))::numeric,3)::text,
    ROUND(v_lucro_pai::numeric,3)::text,
    CASE WHEN ROUND(v_lucro_pai::numeric,2) = ROUND((-v_stake_back + v_stake_lay*(1-v_comissao_lay))::numeric,2)
         THEN 'PASS' ELSE 'FAIL' END, NULL);

  -- ============================================================
  -- CENÁRIO 5 — Edição de aposta SIMPLES já LIQUIDADA
  -- ============================================================
  INSERT INTO public.apostas_unificada (
    workspace_id, user_id, projeto_id, bookmaker_id,
    evento, esporte, mercado, modelo, estrategia, contexto_operacional,
    stake, odd, moeda, data_aposta, status, forma_registro,
    fonte_saldo
  ) VALUES (
    v_ws, v_user, v_proj, v_bk_a,
    '__T_SIMPLES__','Futebol','1X2','NORMAL','PUNTER','NORMAL',
    50, 2.00, 'BRL', now(), 'PENDENTE', 'AVULSA','REAL'
  ) RETURNING id INTO v_simple_id;

  -- Liquidação inicial (GREEN com odd 2.00, stake 50 → lucro=+50)
  PERFORM public.liquidar_aposta_v4(v_simple_id, 'GREEN', 50);

  SELECT COALESCE(SUM(valor),0) INTO v_payout_simples_antigo
  FROM public.financial_events
  WHERE aposta_id=v_simple_id AND tipo_evento='PAYOUT' AND reversed_event_id IS NULL;

  SELECT COALESCE(SUM(valor),0) INTO v_stake_simples_antigo
  FROM public.financial_events
  WHERE aposta_id=v_simple_id AND tipo_evento='STAKE' AND reversed_event_id IS NULL;

  -- Editar via editar_aposta_liquidada_v4: muda odd 2.00 → 2.50, lucro 50 → 75
  v_edit := public.editar_aposta_liquidada_v4(
    v_simple_id, v_bk_a, 50::numeric, 2.50::numeric, 'GREEN', 75::numeric, 'BRL'
  );

  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T5-edit_liquidada', 'editar_aposta_liquidada_v4', 'success=true',
    COALESCE(v_edit->>'success','null'),
    CASE WHEN (v_edit->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, v_edit);

  -- T5.a: REVERSAL emitidos para os eventos antigos
  SELECT COUNT(*) INTO v_reversal_count
  FROM public.financial_events
  WHERE aposta_id=v_simple_id AND tipo_evento='REVERSAL';
  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T5-edit_liquidada', 'REVERSAL events emitidos', '>=2', v_reversal_count::text,
    CASE WHEN v_reversal_count >= 2 THEN 'PASS' ELSE 'FAIL' END, NULL);

  -- T5.b: PAYOUT novo (ativo) reflete a odd nova
  SELECT COALESCE(SUM(valor),0) INTO v_payout_simples_novo
  FROM public.financial_events
  WHERE aposta_id=v_simple_id AND tipo_evento='PAYOUT' AND reversed_event_id IS NULL;
  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T5-edit_liquidada', 'PAYOUT ativo após edição (stake*odd nova)',
    (50*2.50)::text, v_payout_simples_novo::text,
    CASE WHEN ROUND(v_payout_simples_novo::numeric,2) = 125 THEN 'PASS' ELSE 'FAIL' END,
    jsonb_build_object('payout_antes', v_payout_simples_antigo));

  -- T5.c: snapshot lucro_realizado/lucro_prejuizo refletem novo valor
  SELECT lucro_prejuizo INTO v_lucro_realizado FROM public.apostas_unificada WHERE id=v_simple_id;
  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('T5-edit_liquidada', 'lucro_prejuizo snapshot atualizado', '75',
    ROUND(v_lucro_realizado::numeric,2)::text,
    CASE WHEN ROUND(v_lucro_realizado::numeric,2) = 75 THEN 'PASS' ELSE 'FAIL' END, NULL);

  -- T5.d: paridade saldo × ledger no bookmaker A (deve estar consistente após reversal)
  DECLARE
    v_saldo_a NUMERIC;
    v_soma_a NUMERIC;
  BEGIN
    SELECT saldo_atual INTO v_saldo_a FROM public.bookmakers WHERE id=v_bk_a;
    SELECT COALESCE(SUM(valor),0) INTO v_soma_a
      FROM public.financial_events WHERE bookmaker_id=v_bk_a AND reversed_event_id IS NULL;
    INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
    VALUES ('T5-edit_liquidada', 'paridade saldo×ledger bookmaker A (Δ<=0.01)',
      '0.00', ROUND((v_saldo_a - (1000 + v_soma_a))::numeric, 2)::text,
      CASE WHEN ABS(v_saldo_a - (1000 + v_soma_a)) <= 0.01 THEN 'PASS' ELSE 'FAIL' END,
      jsonb_build_object('saldo_atual', v_saldo_a, 'saldo_inicial', 1000, 'soma_ledger', v_soma_a));
  END;

  -- ============================================================
  -- CLEANUP
  -- ============================================================
  DELETE FROM public.financial_events WHERE bookmaker_id IN (v_bk_a, v_bk_b);
  DELETE FROM public.apostas_perna_entradas WHERE perna_id IN (
    SELECT id FROM public.apostas_pernas WHERE aposta_id IN (v_surebet_id, v_simple_id)
  );
  DELETE FROM public.apostas_pernas WHERE aposta_id IN (v_surebet_id, v_simple_id);
  DELETE FROM public.apostas_unificada WHERE id IN (v_surebet_id, v_simple_id);
  DELETE FROM public.projeto_bookmaker_historico WHERE bookmaker_id IN (v_bk_a, v_bk_b);
  DELETE FROM public.bookmakers WHERE id IN (v_bk_a, v_bk_b);

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
  VALUES ('EXCEPTION', SQLSTATE, '-', SQLERRM, 'FAIL', NULL);
  -- best-effort cleanup
  BEGIN
    DELETE FROM public.financial_events WHERE bookmaker_id IN (v_bk_a, v_bk_b);
    DELETE FROM public.apostas_perna_entradas WHERE perna_id IN (
      SELECT id FROM public.apostas_pernas WHERE bookmaker_id IN (v_bk_a, v_bk_b)
    );
    DELETE FROM public.apostas_pernas WHERE bookmaker_id IN (v_bk_a, v_bk_b);
    DELETE FROM public.apostas_unificada WHERE bookmaker_id IN (v_bk_a, v_bk_b);
    DELETE FROM public.projeto_bookmaker_historico WHERE bookmaker_id IN (v_bk_a, v_bk_b);
    DELETE FROM public.bookmakers WHERE id IN (v_bk_a, v_bk_b);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END
$TEST$;
