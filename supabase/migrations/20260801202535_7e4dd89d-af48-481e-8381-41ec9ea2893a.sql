CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v3(p_aposta_id uuid, p_pernas jsonb, p_entradas jsonb, p_evento text, p_esporte text, p_mercado text, p_modelo text, p_estrategia text, p_contexto text, p_data_aposta timestamp with time zone, p_status_manual text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta record; v_workspace_id UUID; v_user_id UUID;
  v_elem jsonb; v_perna_id UUID; v_entrada_id UUID;
  v_perna_idx INTEGER := 0;
  v_input_perna_ids UUID[] := '{}';
  v_input_entrada_ids UUID[] := '{}';
  v_snapshot_pernas_antes JSONB;
  v_snapshot_entradas_antes JSONB;
  v_status_after TEXT;
  v_resultado_after TEXT;
  v_ts_suffix TEXT := extract(epoch from clock_timestamp())::bigint::text;
  v_bk_ids UUID[] := '{}';
  v_parity_before NUMERIC;
  v_parity_after NUMERIC;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada'); END IF;

  v_workspace_id := v_aposta.workspace_id;
  v_user_id := COALESCE(auth.uid(), v_aposta.user_id);

  -- Snapshot BEFORE
  SELECT jsonb_agg(jsonb_build_object('id', id, 'stake', stake, 'odd', odd, 'resultado', resultado, 'lucro_prejuizo', lucro_prejuizo))
  INTO v_snapshot_pernas_antes
  FROM public.apostas_pernas WHERE aposta_id = p_aposta_id;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'perna_id', perna_id, 'stake', stake, 'odd', odd, 'bookmaker_id', bookmaker_id, 'cotacao_snapshot', cotacao_snapshot))
  INTO v_snapshot_entradas_antes
  FROM public.apostas_perna_entradas
  WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id);

  -- === PARIDADE: casas envolvidas (antes + payload) ===
  SELECT COALESCE(array_agg(DISTINCT bk), '{}')
    INTO v_bk_ids
  FROM (
    SELECT ae.bookmaker_id AS bk
    FROM public.apostas_perna_entradas ae
    JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
    WHERE ap.aposta_id = p_aposta_id AND ae.bookmaker_id IS NOT NULL
    UNION
    SELECT ap.bookmaker_id FROM public.apostas_pernas ap WHERE ap.aposta_id = p_aposta_id AND ap.bookmaker_id IS NOT NULL
    UNION
    SELECT (e->>'bookmaker_id')::UUID FROM jsonb_array_elements(COALESCE(p_entradas,'[]'::jsonb)) e WHERE (e->>'bookmaker_id') IS NOT NULL
    UNION
    SELECT (e->>'casa_id')::UUID FROM jsonb_array_elements(COALESCE(p_pernas,'[]'::jsonb)) e WHERE (e->>'casa_id') IS NOT NULL
  ) s;

  v_parity_before := public.fn_bookmaker_parity_sum(v_bk_ids);

  INSERT INTO public.debug_logs (modulo, evento, payload, user_id)
  VALUES ('Surebet', 'AUDIT_EDIT_START',
    jsonb_build_object('aposta_id', p_aposta_id, 'lucro_antes', v_aposta.lucro_prejuizo,
      'status_antes', v_aposta.status, 'pernas_antes', v_snapshot_pernas_antes,
      'entradas_antes', v_snapshot_entradas_antes, 'parity_before', v_parity_before), v_user_id);

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_perna_id := (v_elem->>'id')::UUID;
    IF v_perna_id IS NOT NULL THEN
      v_input_perna_ids := array_append(v_input_perna_ids, v_perna_id);
    END IF;
  END LOOP;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_entradas) LOOP
    v_entrada_id := (v_elem->>'id')::UUID;
    IF v_entrada_id IS NOT NULL THEN
      v_input_entrada_ids := array_append(v_input_entrada_ids, v_entrada_id);
    END IF;
  END LOOP;

  -- REVERSAL UNIFICADO ANTES DO DELETE
  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, reversed_event_id, descricao, created_by
  )
  SELECT
    fe.bookmaker_id, fe.aposta_id, fe.workspace_id, 'REVERSAL', fe.tipo_uso,
    -fe.valor, fe.moeda,
    'rev_edit_' || fe.id || '_' || v_ts_suffix,
    fe.id, 'Estorno por edição (perna/entrada removida)', v_user_id
  FROM public.financial_events fe
  WHERE fe.aposta_id = p_aposta_id
    AND fe.tipo_evento NOT IN ('REVERSAL')
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_events r
      WHERE r.tipo_evento = 'REVERSAL' AND r.reversed_event_id = fe.id
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.apostas_pernas ap
        WHERE ap.aposta_id = p_aposta_id
          AND ap.id <> ALL(v_input_perna_ids)
          AND fe.idempotency_key LIKE '%perna_' || ap.id::text || '%'
      )
      OR EXISTS (
        SELECT 1 FROM public.apostas_perna_entradas ae
        JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
        WHERE ap.aposta_id = p_aposta_id
          AND (ap.id <> ALL(v_input_perna_ids) OR ae.id <> ALL(v_input_entrada_ids))
          AND fe.idempotency_key LIKE '%' || ae.id::text || '%'
      )
    )
  ON CONFLICT (idempotency_key) DO NOTHING;

  DELETE FROM public.apostas_pernas WHERE aposta_id = p_aposta_id AND id <> ALL(v_input_perna_ids);
  UPDATE public.apostas_pernas SET ordem = ordem + 1000 WHERE aposta_id = p_aposta_id;

  v_perna_idx := 0;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_perna_idx := v_perna_idx + 1;
    v_perna_id := (v_elem->>'id')::UUID;

    IF v_perna_id IS NOT NULL THEN
      UPDATE public.apostas_pernas SET
        selecao = v_elem->>'selecao',
        selecao_livre = v_elem->>'selecao_livre',
        ordem = v_perna_idx,
        resultado = COALESCE(v_elem->>'resultado', resultado),
        tipo = COALESCE(NULLIF(v_elem->>'tipo',''), tipo),
        comissao = COALESCE((v_elem->>'comissao')::NUMERIC, comissao),
        updated_at = NOW()
      WHERE id = v_perna_id;
    ELSE
      INSERT INTO public.apostas_pernas (
        aposta_id, ordem, selecao, selecao_livre, bookmaker_id,
        stake, odd, moeda, resultado, tipo, comissao
      ) VALUES (
        p_aposta_id, v_perna_idx, v_elem->>'selecao', v_elem->>'selecao_livre',
        (v_elem->>'casa_id')::UUID, 1, 1, 'BRL', v_elem->>'resultado',
        COALESCE(NULLIF(v_elem->>'tipo',''), 'back'),
        COALESCE((v_elem->>'comissao')::NUMERIC, 0)
      ) RETURNING id INTO v_perna_id;
      v_input_perna_ids := array_append(v_input_perna_ids, v_perna_id);
    END IF;
  END LOOP;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_entradas) LOOP
    v_entrada_id := (v_elem->>'id')::UUID;
    v_perna_id := NULL;

    IF v_entrada_id IS NOT NULL THEN
      SELECT perna_id INTO v_perna_id FROM public.apostas_perna_entradas WHERE id = v_entrada_id;
    END IF;

    IF v_perna_id IS NULL THEN
      IF v_elem ? 'perna_id' AND (v_elem->>'perna_id') IS NOT NULL THEN
        v_perna_id := (v_elem->>'perna_id')::UUID;
      ELSIF v_elem ? 'perna_index' THEN
        v_perna_id := v_input_perna_ids[(v_elem->>'perna_index')::INTEGER + 1];
      ELSIF v_elem ? 'perna_ordem' THEN
        v_perna_id := v_input_perna_ids[(v_elem->>'perna_ordem')::INTEGER];
      END IF;
    END IF;

    IF v_perna_id IS NULL THEN
      RAISE EXCEPTION 'Não foi possível associar a entrada a uma perna válida';
    END IF;

    IF v_entrada_id IS NOT NULL THEN
      v_input_entrada_ids := array_append(v_input_entrada_ids, v_entrada_id);
      UPDATE public.apostas_perna_entradas SET
        perna_id = v_perna_id,
        bookmaker_id = (v_elem->>'bookmaker_id')::UUID,
        stake = (v_elem->>'stake')::NUMERIC,
        odd = (v_elem->>'odd')::NUMERIC,
        moeda = COALESCE(v_elem->>'moeda', 'BRL'),
        fonte_saldo = COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        stake_real = CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN 0 ELSE (v_elem->>'stake')::NUMERIC END,
        stake_freebet = CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN (v_elem->>'stake')::NUMERIC ELSE 0 END,
        tipo = COALESCE(NULLIF(v_elem->>'tipo',''), tipo),
        comissao = COALESCE((v_elem->>'comissao')::NUMERIC, comissao),
        cotacao_snapshot = COALESCE((v_elem->>'cotacao_snapshot')::NUMERIC, cotacao_snapshot),
        stake_brl_referencia = COALESCE((v_elem->>'stake_brl_referencia')::NUMERIC, stake_brl_referencia),
        updated_at = NOW()
      WHERE id = v_entrada_id;
    ELSE
      INSERT INTO public.apostas_perna_entradas (
        perna_id, bookmaker_id, stake, odd, moeda, fonte_saldo,
        stake_real, stake_freebet, tipo, comissao,
        cotacao_snapshot, stake_brl_referencia,
        created_at, updated_at
      ) VALUES (
        v_perna_id, (v_elem->>'bookmaker_id')::UUID, (v_elem->>'stake')::NUMERIC, (v_elem->>'odd')::NUMERIC,
        COALESCE(v_elem->>'moeda', 'BRL'), COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN 0 ELSE (v_elem->>'stake')::NUMERIC END,
        CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN (v_elem->>'stake')::NUMERIC ELSE 0 END,
        COALESCE(NULLIF(v_elem->>'tipo',''), 'back'),
        COALESCE((v_elem->>'comissao')::NUMERIC, 0),
        COALESCE((v_elem->>'cotacao_snapshot')::NUMERIC, 1),
        COALESCE((v_elem->>'stake_brl_referencia')::NUMERIC, (v_elem->>'stake')::NUMERIC),
        NOW(), NOW()
      ) RETURNING id INTO v_entrada_id;
      v_input_entrada_ids := array_append(v_input_entrada_ids, v_entrada_id);
    END IF;

    PERFORM public.fn_sync_stake_event_v1(
      v_entrada_id, p_aposta_id, v_workspace_id, (v_elem->>'bookmaker_id')::UUID,
      (v_elem->>'stake')::NUMERIC, COALESCE(v_elem->>'moeda', 'BRL'),
      COALESCE(v_elem->>'fonte_saldo', 'REAL'), v_user_id
    );
  END LOOP;

  DELETE FROM public.apostas_perna_entradas
  WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id)
    AND id <> ALL(v_input_entrada_ids);

  UPDATE public.apostas_pernas ap
  SET
    stake = sub.total_stake,
    odd = sub.avg_odd,
    moeda = sub.main_moeda,
    bookmaker_id = sub.main_bookmaker_id::UUID,
    stake_real = sub.total_real,
    stake_freebet = sub.total_freebet,
    stake_brl_referencia = sub.total_brl
  FROM (
    SELECT perna_id,
      SUM(stake) as total_stake,
      CASE WHEN SUM(stake) > 0 THEN SUM(odd * stake) / SUM(stake) ELSE 1 END as avg_odd,
      MAX(moeda) as main_moeda,
      MAX(bookmaker_id::TEXT) as main_bookmaker_id,
      SUM(stake_real) as total_real,
      SUM(stake_freebet) as total_freebet,
      SUM(COALESCE(stake_brl_referencia, stake)) as total_brl
    FROM public.apostas_perna_entradas
    WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id)
    GROUP BY perna_id
  ) sub
  WHERE ap.id = sub.perna_id;

  FOR v_perna_id IN SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id AND resultado IS NOT NULL AND resultado <> 'PENDENTE' LOOP
    PERFORM public.liquidar_perna_surebet_v1(v_perna_id, (SELECT resultado FROM public.apostas_pernas WHERE id = v_perna_id), v_workspace_id);
  END LOOP;

  UPDATE public.apostas_unificada SET
    evento = p_evento, esporte = p_esporte, mercado = p_mercado,
    modelo = p_modelo, estrategia = p_estrategia,
    contexto_operacional = p_contexto, data_aposta = p_data_aposta,
    updated_at = NOW()
  WHERE id = p_aposta_id;

  PERFORM public.fn_recalc_pai_surebet(p_aposta_id);

  -- === PARIDADE PÓS-EDIÇÃO ===
  SELECT COALESCE(array_agg(DISTINCT bk), v_bk_ids)
    INTO v_bk_ids
  FROM (
    SELECT unnest(v_bk_ids) AS bk
    UNION
    SELECT ae.bookmaker_id
    FROM public.apostas_perna_entradas ae
    JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
    WHERE ap.aposta_id = p_aposta_id AND ae.bookmaker_id IS NOT NULL
  ) s;

  v_parity_after := public.fn_bookmaker_parity_sum(v_bk_ids);

  IF ABS(COALESCE(v_parity_after,0) - COALESCE(v_parity_before,0)) > 0.01 THEN
    RAISE EXCEPTION 'PARIDADE_SALDO_QUEBRADA: a edição geraria divergência de % entre saldo e eventos financeiros. Operação cancelada.',
      ROUND(COALESCE(v_parity_after,0) - COALESCE(v_parity_before,0), 2);
  END IF;

  SELECT status, resultado INTO v_status_after, v_resultado_after
    FROM public.apostas_unificada WHERE id = p_aposta_id;

  INSERT INTO public.aposta_edit_audit_logs (
    workspace_id, projeto_id, aposta_id, actor_user_id,
    action,
    status_before, resultado_before,
    status_after, resultado_after,
    before_data, after_data,
    success
  ) VALUES (
    v_workspace_id, v_aposta.projeto_id, p_aposta_id, v_user_id,
    'EDIT_SUREBET_COMPLETA',
    v_aposta.status, v_aposta.resultado,
    v_status_after, v_resultado_after,
    jsonb_build_object('pernas', COALESCE(v_snapshot_pernas_antes, '[]'::jsonb),
                       'entradas', COALESCE(v_snapshot_entradas_antes, '[]'::jsonb)),
    jsonb_build_object(
      'pernas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'stake', stake, 'odd', odd, 'resultado', resultado, 'lucro_prejuizo', lucro_prejuizo))
                          FROM public.apostas_pernas WHERE aposta_id = p_aposta_id), '[]'::jsonb),
      'entradas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'perna_id', perna_id, 'stake', stake, 'odd', odd, 'bookmaker_id', bookmaker_id, 'cotacao_snapshot', cotacao_snapshot))
                            FROM public.apostas_perna_entradas
                            WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id)), '[]'::jsonb)
    ),
    true
  );

  RETURN jsonb_build_object('success', true, 'aposta_id', p_aposta_id, 'parity_delta', ROUND(COALESCE(v_parity_after,0) - COALESCE(v_parity_before,0), 4));

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;