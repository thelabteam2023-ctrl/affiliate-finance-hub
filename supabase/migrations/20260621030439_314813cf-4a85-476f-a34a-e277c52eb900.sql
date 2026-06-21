
TRUNCATE public.__phase3_test_report;

CREATE TABLE IF NOT EXISTS public.__phase3_evidence (
  id SERIAL PRIMARY KEY,
  kind TEXT, payload JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.__phase3_evidence TO service_role;
TRUNCATE public.__phase3_evidence;

DO $TEST$
DECLARE
  v_ws UUID := 'f8b6f7ce-92b9-4d26-899a-0f0eeb1324cd';
  v_user UUID := 'b75d8d25-44fc-4bbb-8cf9-e9ae9e5b23b7';
  v_proj UUID := 'de516746-af6e-4ff9-bc2f-43e51bd16364';
  v_bk_a UUID; v_bk_b UUID;
  v_surebet_id UUID; v_simple_id UUID;
  v_perna_back_id UUID; v_perna_lay_id UUID;
  v_create RECORD; v_rpc JSONB; v_edit JSONB;
BEGIN
  INSERT INTO public.bookmakers (user_id, workspace_id, nome, login_username, login_password_encrypted, saldo_atual, moeda, status, projeto_id)
  VALUES (v_user, v_ws, '__T_BK_A__', 't','t', 1000, 'BRL','ativo', v_proj) RETURNING id INTO v_bk_a;
  INSERT INTO public.bookmakers (user_id, workspace_id, nome, login_username, login_password_encrypted, saldo_atual, moeda, status, projeto_id)
  VALUES (v_user, v_ws, '__T_BK_B__', 't','t', 1000, 'BRL','ativo', v_proj) RETURNING id INTO v_bk_b;

  INSERT INTO public.projeto_bookmaker_historico (user_id, workspace_id, projeto_id, bookmaker_id, bookmaker_nome, status_final, data_vinculacao)
  VALUES (v_user, v_ws, v_proj, v_bk_a, '__T_BK_A__', 'ATIVO', now()),
         (v_user, v_ws, v_proj, v_bk_b, '__T_BK_B__', 'ATIVO', now());

  SELECT * INTO v_create FROM public.criar_surebet_atomica_v3(
    v_ws, v_user, v_proj, '__T_EVENTO__','Futebol','1X2','NORMAL','SUREBET','NORMAL', now()::text,
    jsonb_build_array(
      jsonb_build_object('ordem',1,'casa_id',v_bk_a,'selecao','Casa','tipo','back'),
      jsonb_build_object('ordem',2,'casa_id',v_bk_b,'selecao','Fora','tipo','lay','comissao',0.028)
    ),
    jsonb_build_array(
      jsonb_build_object('perna_ordem',1,'bookmaker_id',v_bk_a,'stake',100,'odd',2.00,'moeda','BRL','fonte_saldo','REAL','cotacao_snapshot',1,'stake_brl_referencia',100,'tipo','back'),
      jsonb_build_object('perna_ordem',2,'bookmaker_id',v_bk_b,'stake',96.53,'odd',2.10,'moeda','BRL','fonte_saldo','REAL','cotacao_snapshot',1,'stake_brl_referencia',96.53,'tipo','lay','comissao',0.028)
    )
  );
  v_surebet_id := v_create.o_aposta_id;
  SELECT id INTO v_perna_back_id FROM public.apostas_pernas WHERE aposta_id=v_surebet_id AND tipo='back';
  SELECT id INTO v_perna_lay_id  FROM public.apostas_pernas WHERE aposta_id=v_surebet_id AND tipo='lay';

  -- snapshot ANTES das liquidações
  INSERT INTO public.__phase3_evidence(kind, payload) SELECT 'pernas_antes',
    jsonb_agg(to_jsonb(ap)) FROM public.apostas_pernas ap WHERE aposta_id=v_surebet_id;
  INSERT INTO public.__phase3_evidence(kind, payload) SELECT 'entradas_antes',
    jsonb_agg(to_jsonb(ae)) FROM public.apostas_perna_entradas ae
    JOIN public.apostas_pernas ap ON ap.id=ae.perna_id WHERE ap.aposta_id=v_surebet_id;

  PERFORM public.liquidar_perna_surebet_v1(v_perna_back_id, 'RED', v_ws);
  PERFORM public.liquidar_perna_surebet_v1(v_perna_lay_id, 'GREEN', v_ws);

  -- evidence DEPOIS
  INSERT INTO public.__phase3_evidence(kind, payload) SELECT 'pernas_depois',
    jsonb_agg(to_jsonb(ap)) FROM public.apostas_pernas ap WHERE aposta_id=v_surebet_id;
  INSERT INTO public.__phase3_evidence(kind, payload) SELECT 'pai_depois',
    to_jsonb(au) FROM public.apostas_unificada au WHERE au.id=v_surebet_id;
  INSERT INTO public.__phase3_evidence(kind, payload) SELECT 'eventos_surebet',
    jsonb_agg(jsonb_build_object('tipo',fe.tipo_evento,'valor',fe.valor,'bk',fe.bookmaker_id,'desc',fe.descricao,'rev', fe.reversed_event_id,'idemp',fe.idempotency_key))
    FROM public.financial_events fe WHERE fe.aposta_id=v_surebet_id;
  INSERT INTO public.__phase3_evidence(kind, payload) SELECT 'recalc_output',
    to_jsonb(r) FROM public.fn_recalc_pai_surebet(v_surebet_id) r;

  -- T5
  INSERT INTO public.apostas_unificada (
    workspace_id, user_id, projeto_id, bookmaker_id, evento, esporte, mercado, modelo,
    estrategia, contexto_operacional, stake, odd, data_aposta, status, forma_registro, fonte_saldo
  ) VALUES (
    v_ws, v_user, v_proj, v_bk_a, '__T_SIMPLES__','Futebol','1X2','NORMAL','PUNTER','NORMAL',
    50, 2.00, now(), 'PENDENTE','AVULSA','REAL'
  ) RETURNING id INTO v_simple_id;

  PERFORM public.liquidar_aposta_v4(v_simple_id, 'GREEN', 50);
  INSERT INTO public.__phase3_evidence(kind, payload) SELECT 'simple_eventos_antes',
    jsonb_agg(jsonb_build_object('tipo',fe.tipo_evento,'valor',fe.valor,'rev',fe.reversed_event_id,'idemp',fe.idempotency_key,'id',fe.id))
    FROM public.financial_events fe WHERE fe.aposta_id=v_simple_id;

  v_edit := public.editar_aposta_liquidada_v4(v_simple_id, v_bk_a, 50::numeric, 2.50::numeric, 'GREEN', 75::numeric, 'BRL');
  INSERT INTO public.__phase3_evidence(kind, payload) VALUES ('simple_edit_result', v_edit);

  INSERT INTO public.__phase3_evidence(kind, payload) SELECT 'simple_eventos_depois',
    jsonb_agg(jsonb_build_object('tipo',fe.tipo_evento,'valor',fe.valor,'rev',fe.reversed_event_id,'idemp',fe.idempotency_key,'id',fe.id))
    FROM public.financial_events fe WHERE fe.aposta_id=v_simple_id;

  INSERT INTO public.__phase3_evidence(kind, payload) SELECT 'simple_pai_depois',
    to_jsonb(au) FROM public.apostas_unificada au WHERE id=v_simple_id;

  INSERT INTO public.__phase3_evidence(kind, payload) SELECT 'bk_a_saldo',
    to_jsonb(b) FROM public.bookmakers b WHERE id=v_bk_a;
  INSERT INTO public.__phase3_evidence(kind, payload) SELECT 'bk_b_saldo',
    to_jsonb(b) FROM public.bookmakers b WHERE id=v_bk_b;

  INSERT INTO public.__phase3_evidence(kind, payload) VALUES (
    'ids',
    jsonb_build_object('surebet',v_surebet_id,'simple',v_simple_id,'bk_a',v_bk_a,'bk_b',v_bk_b,
                       'perna_back',v_perna_back_id,'perna_lay',v_perna_lay_id)
  );
END
$TEST$;
