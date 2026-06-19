-- ============================================================
-- criar_surebet_atomica_v3: gravar tipo + comissao em pernas e entradas
-- ============================================================
CREATE OR REPLACE FUNCTION public.criar_surebet_atomica_v3(
  p_workspace_id uuid, p_user_id uuid, p_projeto_id uuid, p_evento text,
  p_esporte text DEFAULT NULL::text, p_mercado text DEFAULT NULL::text,
  p_modelo text DEFAULT NULL::text, p_estrategia text DEFAULT 'SUREBET'::text,
  p_contexto_operacional text DEFAULT 'NORMAL'::text,
  p_data_aposta text DEFAULT NULL::text,
  p_pernas jsonb DEFAULT '[]'::jsonb, p_entradas jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(success boolean, o_aposta_id uuid, events_created integer, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta_id UUID;
  v_perna_json JSONB;
  v_entrada_json JSONB;
  v_idx INTEGER := 0;
  v_perna_id UUID;
  v_entrada_id UUID;
  v_events_count INTEGER := 0;
  v_data_aposta_ts TIMESTAMPTZ;
  v_perna_ordem_map JSONB := '{}'::jsonb;
  v_perna_ordem INTEGER;
  v_perna_casa_id UUID;
  v_perna_selecao TEXT;
  v_perna_selecao_livre TEXT;
  v_perna_stake_main NUMERIC;
  v_perna_odd_main NUMERIC;
  v_perna_moeda_main TEXT;
  v_perna_fonte_saldo_main TEXT;
  v_perna_cotacao_snapshot_main NUMERIC;
  v_perna_stake_brl_referencia_main NUMERIC;
  v_perna_tipo TEXT;
  v_perna_comissao NUMERIC;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_moeda TEXT;
  v_fonte_saldo TEXT;
  v_cotacao_snapshot NUMERIC;
  v_stake_brl_referencia NUMERIC;
  v_entrada_perna_ordem INTEGER;
  v_entrada_tipo TEXT;
  v_entrada_comissao NUMERIC;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  PERFORM set_config('app.skip_perna_auto_stake', 'on', true);
  v_data_aposta_ts := COALESCE(p_data_aposta::TIMESTAMPTZ, NOW());

  INSERT INTO public.apostas_unificada (
    workspace_id, user_id, projeto_id, evento, esporte, mercado, modelo,
    estrategia, contexto_operacional, data_aposta, status, forma_registro,
    created_at, updated_at
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id, p_evento, p_esporte, p_mercado, p_modelo,
    p_estrategia, p_contexto_operacional, v_data_aposta_ts, 'PENDENTE', 'ARBITRAGEM',
    NOW(), NOW()
  ) RETURNING id INTO v_aposta_id;

  FOR v_perna_json IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_idx := v_idx + 1;
    v_perna_ordem := (v_perna_json->>'ordem')::INTEGER;
    v_perna_casa_id := (v_perna_json->>'casa_id')::UUID;
    v_perna_selecao := COALESCE(v_perna_json->>'selecao', 'Seleção ' || v_idx);
    v_perna_selecao_livre := v_perna_json->>'selecao_livre';
    v_perna_tipo := COALESCE(NULLIF(v_perna_json->>'tipo',''), 'back');
    v_perna_comissao := COALESCE((v_perna_json->>'comissao')::NUMERIC, 0);

    v_perna_stake_main := 0; v_perna_odd_main := 1; v_perna_moeda_main := 'BRL';
    v_perna_fonte_saldo_main := 'REAL'; v_perna_cotacao_snapshot_main := 1;
    v_perna_stake_brl_referencia_main := 0;

    FOR v_entrada_json IN
      SELECT elem FROM jsonb_array_elements(p_entradas) AS elem
      WHERE (elem->>'perna_ordem')::INTEGER = v_perna_ordem LIMIT 1
    LOOP
      v_perna_stake_main := COALESCE((v_entrada_json->>'stake')::NUMERIC, 0);
      v_perna_odd_main := COALESCE((v_entrada_json->>'odd')::NUMERIC, 1);
      v_perna_moeda_main := COALESCE(v_entrada_json->>'moeda', 'BRL');
      v_perna_fonte_saldo_main := COALESCE(v_entrada_json->>'fonte_saldo', 'REAL');
      v_perna_cotacao_snapshot_main := (v_entrada_json->>'cotacao_snapshot')::NUMERIC;
      v_perna_stake_brl_referencia_main := (v_entrada_json->>'stake_brl_referencia')::NUMERIC;
    END LOOP;

    INSERT INTO public.apostas_pernas (
      aposta_id, ordem, selecao, selecao_livre, bookmaker_id,
      stake, odd, moeda, fonte_saldo,
      cotacao_snapshot, stake_brl_referencia,
      stake_real, stake_freebet, tipo, comissao,
      created_at, updated_at
    ) VALUES (
      v_aposta_id, v_perna_ordem, v_perna_selecao, v_perna_selecao_livre, v_perna_casa_id,
      v_perna_stake_main, v_perna_odd_main, v_perna_moeda_main, v_perna_fonte_saldo_main,
      v_perna_cotacao_snapshot_main, v_perna_stake_brl_referencia_main,
      CASE WHEN v_perna_fonte_saldo_main = 'FREEBET' THEN 0 ELSE v_perna_stake_main END,
      CASE WHEN v_perna_fonte_saldo_main = 'FREEBET' THEN v_perna_stake_main ELSE 0 END,
      v_perna_tipo, v_perna_comissao,
      NOW(), NOW()
    ) RETURNING id INTO v_perna_id;

    v_perna_ordem_map := v_perna_ordem_map || jsonb_build_object(v_perna_ordem::text, v_perna_id);
  END LOOP;

  FOR v_entrada_json IN SELECT * FROM jsonb_array_elements(p_entradas) LOOP
    v_entrada_perna_ordem := (v_entrada_json->>'perna_ordem')::INTEGER;
    v_perna_id := (v_perna_ordem_map->>v_entrada_perna_ordem::text)::UUID;
    v_bookmaker_id := (v_entrada_json->>'bookmaker_id')::UUID;
    v_stake := (v_entrada_json->>'stake')::NUMERIC;
    v_odd := (v_entrada_json->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_entrada_json->>'moeda', 'BRL');
    v_fonte_saldo := COALESCE(v_entrada_json->>'fonte_saldo', 'REAL');
    v_cotacao_snapshot := (v_entrada_json->>'cotacao_snapshot')::NUMERIC;
    v_stake_brl_referencia := (v_entrada_json->>'stake_brl_referencia')::NUMERIC;
    v_entrada_tipo := COALESCE(NULLIF(v_entrada_json->>'tipo',''), 'back');
    v_entrada_comissao := COALESCE((v_entrada_json->>'comissao')::NUMERIC, 0);

    IF v_perna_id IS NULL THEN
       RAISE EXCEPTION 'Perna com ordem % não encontrada no mapeamento', v_entrada_perna_ordem;
    END IF;

    INSERT INTO public.apostas_perna_entradas (
      perna_id, bookmaker_id, stake, odd, moeda,
      fonte_saldo, cotacao_snapshot, stake_brl_referencia,
      stake_real, stake_freebet, tipo, comissao,
      created_at, updated_at
    ) VALUES (
      v_perna_id, v_bookmaker_id, v_stake, v_odd, v_moeda,
      v_fonte_saldo, v_cotacao_snapshot, v_stake_brl_referencia,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
      v_entrada_tipo, v_entrada_comissao,
      NOW(), NOW()
    ) RETURNING id INTO v_entrada_id;

    PERFORM public.fn_sync_stake_event_v1(
      v_entrada_id, v_aposta_id, p_workspace_id, v_bookmaker_id,
      v_stake, v_moeda, v_fonte_saldo, p_user_id
    );

    v_events_count := v_events_count + 1;
  END LOOP;

  PERFORM public.fn_recalc_pai_surebet(v_aposta_id);
  RETURN QUERY SELECT true, v_aposta_id, v_events_count, 'Surebet criada com sucesso (v3)'::text;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::uuid, 0, SQLERRM;
END;
$function$;

-- ============================================================
-- editar_surebet_completa_v3: atualizar tipo/comissao em pernas e entradas
-- (apenas blocos modificados; demais permanecem iguais)
-- ============================================================
CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v3(
  p_aposta_id uuid, p_pernas jsonb, p_entradas jsonb,
  p_evento text, p_esporte text, p_mercado text, p_modelo text,
  p_estrategia text, p_contexto text, p_data_aposta timestamp with time zone,
  p_status_manual text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta record; v_workspace_id UUID; v_user_id UUID;
  v_elem jsonb; v_perna_id UUID; v_entrada_id UUID;
  v_perna_idx INTEGER := 0;
  v_input_perna_ids UUID[] := '{}';
  v_input_entrada_ids UUID[] := '{}';
  v_todas_liquidadas BOOLEAN; v_lucro_total NUMERIC; v_stake_total NUMERIC;
  v_resultado_final TEXT; v_is_multicurrency BOOLEAN;
  v_pl_consolidado NUMERIC; v_stake_consolidado NUMERIC; v_consol_currency TEXT;
  v_audit_log_id UUID; v_snapshot_pernas_antes JSONB; v_snapshot_entradas_antes JSONB;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada'); END IF;

  v_workspace_id := v_aposta.workspace_id;
  v_user_id := auth.uid();

  SELECT jsonb_agg(jsonb_build_object('id', id, 'stake', stake, 'odd', odd, 'resultado', resultado))
  INTO v_snapshot_pernas_antes
  FROM public.apostas_pernas WHERE aposta_id = p_aposta_id;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'perna_id', perna_id, 'stake', stake, 'odd', odd, 'bookmaker_id', bookmaker_id))
  INTO v_snapshot_entradas_antes
  FROM public.apostas_perna_entradas
  WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id);

  INSERT INTO public.debug_logs (modulo, evento, payload, user_id)
  VALUES ('Surebet', 'AUDIT_EDIT_START',
    jsonb_build_object('aposta_id', p_aposta_id, 'lucro_antes', v_aposta.lucro_prejuizo,
      'status_antes', v_aposta.status, 'pernas_antes', v_snapshot_pernas_antes,
      'entradas_antes', v_snapshot_entradas_antes), v_user_id
  ) RETURNING id INTO v_audit_log_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_perna_id := (v_elem->>'id')::UUID;
    IF v_perna_id IS NOT NULL THEN
      v_input_perna_ids := array_append(v_input_perna_ids, v_perna_id);
    END IF;
  END LOOP;

  INSERT INTO public.financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, valor, moeda, idempotency_key, reversed_event_id, descricao)
  SELECT bookmaker_id, aposta_id, workspace_id, 'REVERSAL', -valor, moeda, 'rev_del_perna_' || id || '_' || extract(epoch from now())::bigint, id, 'Estorno por remoção de perna na edição'
  FROM public.financial_events
  WHERE aposta_id = p_aposta_id
    AND (idempotency_key LIKE 'stake_perna_%' OR idempotency_key LIKE 'payout_perna_%')
    AND EXISTS (
      SELECT 1 FROM public.apostas_pernas ap
      WHERE ap.aposta_id = p_aposta_id AND ap.id <> ALL(v_input_perna_ids)
      AND (public.financial_events.idempotency_key LIKE '%' || ap.id || '%')
    )
    AND NOT EXISTS (SELECT 1 FROM public.financial_events r WHERE r.reversed_event_id = public.financial_events.id);

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
      RETURN jsonb_build_object('success', false, 'error', 'Não foi possível associar a entrada a uma perna válida');
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
        updated_at = NOW()
      WHERE id = v_entrada_id;
    ELSE
      INSERT INTO public.apostas_perna_entradas (
        perna_id, bookmaker_id, stake, odd, moeda, fonte_saldo,
        stake_real, stake_freebet, tipo, comissao, created_at, updated_at
      ) VALUES (
        v_perna_id, (v_elem->>'bookmaker_id')::UUID, (v_elem->>'stake')::NUMERIC, (v_elem->>'odd')::NUMERIC,
        COALESCE(v_elem->>'moeda', 'BRL'), COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN 0 ELSE (v_elem->>'stake')::NUMERIC END,
        CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN (v_elem->>'stake')::NUMERIC ELSE 0 END,
        COALESCE(NULLIF(v_elem->>'tipo',''), 'back'),
        COALESCE((v_elem->>'comissao')::NUMERIC, 0),
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

  INSERT INTO public.financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, valor, moeda, idempotency_key, reversed_event_id, descricao)
  SELECT bookmaker_id, aposta_id, workspace_id, 'REVERSAL', -valor, moeda, 'rev_del_ent_' || id || '_' || extract(epoch from now())::bigint, id, 'Estorno por remoção de entrada na edição'
  FROM public.financial_events
  WHERE aposta_id = p_aposta_id
    AND (idempotency_key LIKE 'stake_entry_%' OR idempotency_key LIKE '%ent_%')
    AND EXISTS (
      SELECT 1 FROM public.apostas_perna_entradas ae
      JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
      WHERE ap.aposta_id = p_aposta_id AND ae.id <> ALL(v_input_entrada_ids)
      AND (public.financial_events.idempotency_key LIKE '%' || ae.id || '%')
    )
    AND NOT EXISTS (SELECT 1 FROM public.financial_events r WHERE r.reversed_event_id = public.financial_events.id);

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

  RETURN jsonb_build_object('success', true, 'aposta_id', p_aposta_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

NOTIFY pgrst, 'reload schema';