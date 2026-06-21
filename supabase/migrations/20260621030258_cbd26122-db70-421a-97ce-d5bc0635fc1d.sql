
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
  v_reversal_count INTEGER;
  v_rpc JSONB;
  v_edit JSONB;
  v_create RECORD;
  v_lucro_realizado NUMERIC;
  v_saldo_a NUMERIC; v_soma_a NUMERIC;
BEGIN
  v_liability_esperada := ROUND(v_stake_lay * (v_odd_lay - 1), 3);

  -- SETUP
  BEGIN
    INSERT INTO public.bookmakers (user_id, workspace_id, nome, login_username, login_password_encrypted, saldo_atual, moeda, status, projeto_id)
    VALUES (v_user, v_ws, '__T_BK_A__', 't','t', 1000, 'BRL','ativo', v_proj) RETURNING id INTO v_bk_a;
    INSERT INTO public.bookmakers (user_id, workspace_id, nome, login_username, login_password_encrypted, saldo_atual, moeda, status, projeto_id)
    VALUES (v_user, v_ws, '__T_BK_B__', 't','t', 1000, 'BRL','ativo', v_proj) RETURNING id INTO v_bk_b;

    INSERT INTO public.projeto_bookmaker_historico (user_id, workspace_id, projeto_id, bookmaker_id, bookmaker_nome, status_final, data_vinculacao)
    VALUES (v_user, v_ws, v_proj, v_bk_a, '__T_BK_A__', 'ATIVO', now()),
           (v_user, v_ws, v_proj, v_bk_b, '__T_BK_B__', 'ATIVO', now());

    INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
    VALUES ('SETUP','fixtures criados','OK','OK','PASS', jsonb_build_object('bk_a',v_bk_a,'bk_b',v_bk_b));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
    VALUES ('SETUP','fixtures','OK', SQLERRM,'FAIL', NULL);
    RETURN;
  END;

  -- CENÁRIO 1 — Criação de surebet BACK + LAY
  BEGIN
    SELECT * INTO v_create FROM public.criar_surebet_atomica_v3(
      v_ws, v_user, v_proj, '__T_EVENTO__','Futebol','1X2','NORMAL','SUREBET','NORMAL', now()::text,
      jsonb_build_array(
        jsonb_build_object('ordem',1,'casa_id',v_bk_a,'selecao','Casa','tipo','back'),
        jsonb_build_object('ordem',2,'casa_id',v_bk_b,'selecao','Fora','tipo','lay','comissao',v_comissao_lay)
      ),
      jsonb_build_array(
        jsonb_build_object('perna_ordem',1,'bookmaker_id',v_bk_a,'stake',v_stake_back,'odd',v_odd_back,'moeda','BRL','fonte_saldo','REAL','cotacao_snapshot',1,'stake_brl_referencia',v_stake_back,'tipo','back'),
        jsonb_build_object('perna_ordem',2,'bookmaker_id',v_bk_b,'stake',v_stake_lay,'odd',v_odd_lay,'moeda','BRL','fonte_saldo','REAL','cotacao_snapshot',1,'stake_brl_referencia',v_stake_lay,'tipo','lay','comissao',v_comissao_lay)
      )
    );
    v_surebet_id := v_create.o_aposta_id;

    INSERT INTO public.__phase3_test_report(cenario, etapa, esperado, observado, status, detalhes)
    VALUES ('T1-criacao','criar_surebet_atomica_v3','success=true',
            'success='||COALESCE(v_create.success::text,'NULL'),
            CASE WHEN v_create.success THEN 'PASS' ELSE 'FAIL' END,
            jsonb_build_object('surebet_id',v_surebet_id,'msg',v_create.message));

    SELECT id INTO v_perna_back_id FROM public.apostas_pernas WHERE aposta_id=v_surebet_id AND tipo='back';
    SELECT id INTO v_perna_lay_id  FROM public.apostas_pernas WHERE aposta_id=v_surebet_id AND tipo='lay';

    SELECT valor INTO v_debito_back FROM public.financial_events
     WHERE aposta_id=v_surebet_id AND bookmaker_id=v_bk_a AND tipo_evento='STAKE' AND reversed_event_id IS NULL LIMIT 1;
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T1-criacao','debito BACK == -stake', (-v_stake_back)::text, v_debito_back::text,
     CASE WHEN ROUND(v_debito_back::numeric,3)=ROUND((-v_stake_back)::numeric,3) THEN 'PASS' ELSE 'FAIL' END, NULL);

    SELECT valor INTO v_debito_lay FROM public.financial_events
     WHERE aposta_id=v_surebet_id AND bookmaker_id=v_bk_b AND tipo_evento='STAKE' AND reversed_event_id IS NULL LIMIT 1;
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T1-criacao','debito LAY == -liability (NÃO stake)', (-v_liability_esperada)::text, v_debito_lay::text,
     CASE WHEN ROUND(v_debito_lay::numeric,3)=ROUND((-v_liability_esperada)::numeric,3) THEN 'PASS' ELSE 'FAIL' END,
     jsonb_build_object('liability_esperada',v_liability_esperada,'erro_se_fosse_stake',-v_stake_lay));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes)
    VALUES ('T1-criacao','exception','-', SQLSTATE||': '||SQLERRM,'FAIL', NULL);
  END;

  -- CENÁRIO 3 — Liquidação perna a perna (BACK RED / LAY GREEN) = botão "LAY ganha"
  BEGIN
    v_rpc := public.liquidar_perna_surebet_v1(v_perna_back_id, 'RED', v_ws);
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T3-perna_a_perna','liquidar BACK RED','success=true', COALESCE(v_rpc->>'success','null'),
     CASE WHEN (v_rpc->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, v_rpc);

    v_rpc := public.liquidar_perna_surebet_v1(v_perna_lay_id, 'GREEN', v_ws);
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T3-perna_a_perna','liquidar LAY GREEN','success=true', COALESCE(v_rpc->>'success','null'),
     CASE WHEN (v_rpc->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, v_rpc);

    SELECT COALESCE(SUM(valor),0) INTO v_payout_back
    FROM public.financial_events WHERE aposta_id=v_surebet_id AND bookmaker_id=v_bk_a
      AND tipo_evento IN ('PAYOUT','VOID_REFUND') AND reversed_event_id IS NULL;
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T3-perna_a_perna','PAYOUT BACK RED == 0','0', v_payout_back::text,
     CASE WHEN v_payout_back=0 THEN 'PASS' ELSE 'FAIL' END, NULL);

    SELECT COALESCE(SUM(valor) FILTER (WHERE tipo_evento='PAYOUT'),0),
           COALESCE(SUM(valor) FILTER (WHERE tipo_evento='VOID_REFUND'),0)
      INTO v_payout_lay, v_refund_lay
    FROM public.financial_events WHERE aposta_id=v_surebet_id AND bookmaker_id=v_bk_b
      AND tipo_evento IN ('PAYOUT','VOID_REFUND') AND reversed_event_id IS NULL;

    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T3-perna_a_perna','PAYOUT LAY GREEN == stake*(1-comissao)',
     ROUND(v_stake_lay*(1-v_comissao_lay),3)::text, ROUND(v_payout_lay::numeric,3)::text,
     CASE WHEN ROUND(v_payout_lay::numeric,2)=ROUND((v_stake_lay*(1-v_comissao_lay))::numeric,2) THEN 'PASS' ELSE 'FAIL' END,
     jsonb_build_object('payout_lay',v_payout_lay,'refund_lay',v_refund_lay));

    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T3-perna_a_perna','VOID_REFUND LAY libera liability',
     v_liability_esperada::text, ROUND(v_refund_lay::numeric,3)::text,
     CASE WHEN ROUND(v_refund_lay::numeric,2)=ROUND(v_liability_esperada::numeric,2) THEN 'PASS' ELSE 'FAIL' END, NULL);

    SELECT lucro_prejuizo INTO v_lucro_pai FROM public.apostas_unificada WHERE id=v_surebet_id;
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T3-perna_a_perna','lucro pai == -stake_back + stake_lay*(1-comissao)',
     ROUND((-v_stake_back + v_stake_lay*(1-v_comissao_lay))::numeric,3)::text,
     ROUND(v_lucro_pai::numeric,3)::text,
     CASE WHEN ROUND(v_lucro_pai::numeric,2)=ROUND((-v_stake_back + v_stake_lay*(1-v_comissao_lay))::numeric,2) THEN 'PASS' ELSE 'FAIL' END, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes)
    VALUES ('T3-perna_a_perna','exception','-', SQLSTATE||': '||SQLERRM,'FAIL', NULL);
  END;

  -- CENÁRIO 5 — Edit de aposta SIMPLES já liquidada (sem coluna `moeda` em apostas_unificada)
  BEGIN
    INSERT INTO public.apostas_unificada (
      workspace_id, user_id, projeto_id, bookmaker_id, evento, esporte, mercado, modelo,
      estrategia, contexto_operacional, stake, odd, data_aposta, status, forma_registro, fonte_saldo
    ) VALUES (
      v_ws, v_user, v_proj, v_bk_a, '__T_SIMPLES__','Futebol','1X2','NORMAL','PUNTER','NORMAL',
      50, 2.00, now(), 'PENDENTE','AVULSA','REAL'
    ) RETURNING id INTO v_simple_id;

    PERFORM public.liquidar_aposta_v4(v_simple_id, 'GREEN', 50);

    SELECT COALESCE(SUM(valor),0) INTO v_payout_simples_antigo
    FROM public.financial_events WHERE aposta_id=v_simple_id AND tipo_evento='PAYOUT' AND reversed_event_id IS NULL;

    v_edit := public.editar_aposta_liquidada_v4(v_simple_id, v_bk_a, 50::numeric, 2.50::numeric, 'GREEN', 75::numeric, 'BRL');
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T5-edit_liquidada','editar_aposta_liquidada_v4','success=true', COALESCE(v_edit->>'success','null'),
     CASE WHEN (v_edit->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, v_edit);

    SELECT COUNT(*) INTO v_reversal_count FROM public.financial_events
     WHERE aposta_id=v_simple_id AND tipo_evento='REVERSAL';
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T5-edit_liquidada','REVERSAL events emitidos','>=2', v_reversal_count::text,
     CASE WHEN v_reversal_count>=2 THEN 'PASS' ELSE 'FAIL' END, NULL);

    SELECT COALESCE(SUM(valor),0) INTO v_payout_simples_novo
    FROM public.financial_events WHERE aposta_id=v_simple_id AND tipo_evento='PAYOUT' AND reversed_event_id IS NULL;
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T5-edit_liquidada','PAYOUT ativo == stake*odd_nova (125)', '125', v_payout_simples_novo::text,
     CASE WHEN ROUND(v_payout_simples_novo::numeric,2)=125 THEN 'PASS' ELSE 'FAIL' END,
     jsonb_build_object('payout_antes',v_payout_simples_antigo));

    SELECT lucro_prejuizo INTO v_lucro_realizado FROM public.apostas_unificada WHERE id=v_simple_id;
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T5-edit_liquidada','snapshot lucro_prejuizo atualizado','75', ROUND(v_lucro_realizado::numeric,2)::text,
     CASE WHEN ROUND(v_lucro_realizado::numeric,2)=75 THEN 'PASS' ELSE 'FAIL' END, NULL);

    SELECT saldo_atual INTO v_saldo_a FROM public.bookmakers WHERE id=v_bk_a;
    SELECT COALESCE(SUM(valor),0) INTO v_soma_a FROM public.financial_events
     WHERE bookmaker_id=v_bk_a AND reversed_event_id IS NULL;
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes) VALUES
    ('T5-edit_liquidada','paridade saldo×ledger BK_A (Δ<=0.01)','0',
     ROUND((v_saldo_a-(1000+v_soma_a))::numeric,2)::text,
     CASE WHEN ABS(v_saldo_a-(1000+v_soma_a))<=0.01 THEN 'PASS' ELSE 'FAIL' END,
     jsonb_build_object('saldo_atual',v_saldo_a,'saldo_inicial',1000,'soma_ledger',v_soma_a));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes)
    VALUES ('T5-edit_liquidada','exception','-', SQLSTATE||': '||SQLERRM,'FAIL', NULL);
  END;

  -- CLEANUP
  BEGIN
    DELETE FROM public.financial_events WHERE bookmaker_id IN (v_bk_a, v_bk_b);
    DELETE FROM public.apostas_perna_entradas WHERE perna_id IN
      (SELECT id FROM public.apostas_pernas WHERE aposta_id IN (v_surebet_id, v_simple_id));
    DELETE FROM public.apostas_pernas WHERE aposta_id IN (v_surebet_id, v_simple_id);
    DELETE FROM public.apostas_unificada WHERE id IN (v_surebet_id, v_simple_id);
    DELETE FROM public.projeto_bookmaker_historico WHERE bookmaker_id IN (v_bk_a, v_bk_b);
    DELETE FROM public.bookmakers WHERE id IN (v_bk_a, v_bk_b);
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes)
    VALUES ('CLEANUP','fixtures removidos','OK','OK','PASS', NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.__phase3_test_report(cenario,etapa,esperado,observado,status,detalhes)
    VALUES ('CLEANUP','erro removendo fixtures','OK', SQLSTATE||': '||SQLERRM, 'FAIL',
            jsonb_build_object('bk_a',v_bk_a,'bk_b',v_bk_b));
  END;
END
$TEST$;
