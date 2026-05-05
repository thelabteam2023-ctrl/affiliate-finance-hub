-- =============================================================================
-- FIX: criar_surebet_atomica (v13)
-- Suporte a múltiplas entradas por perna (vias) com agrupamento de payout
-- =============================================================================

CREATE OR REPLACE FUNCTION public.criar_surebet_atomica(
  p_workspace_id uuid,
  p_user_id uuid,
  p_projeto_id uuid,
  p_evento text,
  p_esporte text DEFAULT NULL,
  p_mercado text DEFAULT NULL,
  p_modelo text DEFAULT NULL,
  p_estrategia text DEFAULT 'SUREBET',
  p_contexto_operacional text DEFAULT 'NORMAL',
  p_data_aposta text DEFAULT NULL,
  p_pernas jsonb DEFAULT '[]'
)
RETURNS TABLE(success boolean, aposta_id uuid, events_created integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta_id UUID;
  v_perna JSONB;
  v_perna_idx INTEGER := 0;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_moeda TEXT;
  v_selecao TEXT;
  v_selecao_livre TEXT;
  v_saldo_atual NUMERIC;
  v_saldo_freebet NUMERIC;
  v_bookmaker_status TEXT;
  v_stake_total NUMERIC := 0;
  v_stake_real_total NUMERIC := 0;
  v_stake_freebet_total NUMERIC := 0;
  v_stake_consolidado NUMERIC := 0;
  v_events_created INTEGER := 0;
  v_perna_id UUID;
  v_event_id UUID;
  v_roi_esperado NUMERIC;
  v_lucro_esperado NUMERIC;
  v_cotacao_snapshot NUMERIC;
  v_stake_brl_referencia NUMERIC;
  v_fonte_saldo TEXT;
  v_data_aposta timestamptz;
  v_moeda_consolidacao TEXT;
  v_moedas TEXT[] := '{}';
  v_snapshot_brl_consol NUMERIC;
  v_rate NUMERIC;
  v_input_ordem INTEGER;
  
  -- Agrupamento por cenário (leg)
  v_stake_real_consol_total NUMERIC := 0;
  v_leg_payouts_map JSONB := '{}'::jsonb; -- key: ordem, value: payout_consolidado
  v_leg_ordens INTEGER[] := '{}';
  v_scenario_lucro NUMERIC;
  v_min_lucro NUMERIC;
  v_payout_entry_consol NUMERIC;
  v_i INTEGER;
  v_ordem_key TEXT;
BEGIN
  IF p_data_aposta IS NULL OR btrim(p_data_aposta) = '' THEN
    v_data_aposta := now();
  ELSE
    v_data_aposta := p_data_aposta::timestamptz;
  END IF;

  IF jsonb_array_length(p_pernas) < 2 THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 'Surebet requer no mínimo 2 pernas'::TEXT;
    RETURN;
  END IF;

  -- Obter moeda de consolidação do projeto
  SELECT COALESCE(p.moeda_consolidacao, 'BRL') INTO v_moeda_consolidacao
  FROM projetos p WHERE p.id = p_projeto_id;
  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  -- Obter taxa BRL da moeda de consolidação (se não for BRL)
  IF v_moeda_consolidacao != 'BRL' THEN
    FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
      IF (v_perna->>'moeda') = v_moeda_consolidacao AND (v_perna->>'cotacao_snapshot') IS NOT NULL THEN
        v_snapshot_brl_consol := (v_perna->>'cotacao_snapshot')::NUMERIC;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- Primeira passada: validar saldos e acumular totais + agrupar payouts por ordem (cenário)
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_perna_idx := v_perna_idx + 1;
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_odd := (v_perna->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_perna->>'moeda', 'BRL');
    v_fonte_saldo := COALESCE(v_perna->>'fonte_saldo', 'REAL');
    v_cotacao_snapshot := (v_perna->>'cotacao_snapshot')::NUMERIC;
    v_input_ordem := COALESCE((v_perna->>'ordem')::INTEGER, v_perna_idx);

    -- Rastrear moedas
    IF NOT (v_moeda = ANY(v_moedas)) THEN
      v_moedas := array_append(v_moedas, v_moeda);
    END IF;

    -- Validar bookmaker
    SELECT b.saldo_atual, b.saldo_freebet, b.status 
    INTO v_saldo_atual, v_saldo_freebet, v_bookmaker_status
    FROM bookmakers b WHERE b.id = v_bookmaker_id AND b.workspace_id = p_workspace_id;
    
    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
        format('Entrada %s: Bookmaker não encontrada', v_perna_idx)::TEXT;
      RETURN;
    END IF;
    
    IF LOWER(v_bookmaker_status) NOT IN ('ativo', 'limitada') THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
        format('Entrada %s: Bookmaker com status "%s" não permite apostas', v_perna_idx, v_bookmaker_status)::TEXT;
      RETURN;
    END IF;
    
    IF v_fonte_saldo = 'FREEBET' THEN
      IF v_stake > COALESCE(v_saldo_freebet, 0) THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
          format('Entrada %s: Saldo freebet insuficiente (stake: %s, disponível: %s)', v_perna_idx, v_stake, COALESCE(v_saldo_freebet, 0))::TEXT;
        RETURN;
      END IF;
      v_stake_freebet_total := v_stake_freebet_total + v_stake;
    ELSE
      IF v_stake > v_saldo_atual THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
          format('Entrada %s: Saldo insuficiente (stake: %s, disponível: %s)', v_perna_idx, v_stake, v_saldo_atual)::TEXT;
        RETURN;
      END IF;
      v_stake_real_total := v_stake_real_total + v_stake;
    END IF;
    
    v_stake_total := v_stake_total + v_stake;

    -- Calcular taxa para esta entrada
    IF v_moeda = v_moeda_consolidacao THEN
      v_rate := 1;
    ELSIF v_moeda_consolidacao = 'BRL' THEN
      v_rate := COALESCE(v_cotacao_snapshot, 1);
    ELSE
      IF v_cotacao_snapshot IS NOT NULL AND v_cotacao_snapshot > 0
         AND v_snapshot_brl_consol IS NOT NULL AND v_snapshot_brl_consol > 0 THEN
        v_rate := v_cotacao_snapshot / v_snapshot_brl_consol;
      ELSE
        v_rate := 1;
      END IF;
    END IF;

    v_stake_consolidado := v_stake_consolidado + (v_stake * v_rate);
    
    -- Acumular custo real consolidado
    IF v_fonte_saldo <> 'FREEBET' THEN
      v_stake_real_consol_total := v_stake_real_consol_total + (v_stake * v_rate);
    END IF;

    -- Calcular payout consolidado DESTA ENTRADA
    IF v_fonte_saldo = 'FREEBET' THEN
      v_payout_entry_consol := v_stake * (v_odd - 1) * v_rate;
    ELSE
      v_payout_entry_consol := v_stake * v_odd * v_rate;
    END IF;

    -- Agrupar payout por ordem (Cenário)
    v_ordem_key := v_input_ordem::TEXT;
    IF v_leg_payouts_map ? v_ordem_key THEN
      v_leg_payouts_map := jsonb_set(
        v_leg_payouts_map, 
        array[v_ordem_key], 
        to_jsonb(COALESCE((v_leg_payouts_map->>v_ordem_key)::NUMERIC, 0) + v_payout_entry_consol)
      );
    ELSE
      v_leg_payouts_map := v_leg_payouts_map || jsonb_build_object(v_ordem_key, v_payout_entry_consol);
      v_leg_ordens := array_append(v_leg_ordens, v_input_ordem);
    END IF;
  END LOOP;

  -- Calcular lucro esperado baseado nos cenários agrupados
  v_min_lucro := NULL;
  FOR v_i IN 1..array_length(v_leg_ordens, 1) LOOP
    v_ordem_key := v_leg_ordens[v_i]::TEXT;
    v_scenario_lucro := (v_leg_payouts_map->>v_ordem_key)::NUMERIC - v_stake_real_consol_total;
    
    IF v_min_lucro IS NULL OR v_scenario_lucro < v_min_lucro THEN
      v_min_lucro := v_scenario_lucro;
    END IF;
  END LOOP;

  v_lucro_esperado := COALESCE(v_min_lucro, 0);
  v_roi_esperado := CASE WHEN v_stake_real_consol_total > 0 
    THEN (v_lucro_esperado / v_stake_real_consol_total) * 100 
    ELSE 0 END;
  
  INSERT INTO apostas_unificada (
    workspace_id, user_id, projeto_id,
    forma_registro, estrategia, contexto_operacional,
    evento, esporte, mercado, modelo,
    data_aposta, stake_total, stake_real, stake_freebet,
    stake_consolidado, is_multicurrency, consolidation_currency,
    lucro_esperado, roi_esperado,
    status, resultado
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id,
    'ARBITRAGEM', p_estrategia, p_contexto_operacional,
    p_evento, p_esporte, p_mercado, p_modelo,
    v_data_aposta, v_stake_total, v_stake_real_total, v_stake_freebet_total,
    ROUND(v_stake_consolidado, 2), (array_length(v_moedas, 1) > 1), v_moeda_consolidacao,
    ROUND(v_lucro_esperado, 2), ROUND(v_roi_esperado, 4),
    'PENDENTE', 'PENDENTE'
  )
  RETURNING id INTO v_aposta_id;

  -- Segunda passada: inserir pernas e eventos financeiros
  v_perna_idx := 0;
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_perna_idx := v_perna_idx + 1;
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_odd := (v_perna->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_perna->>'moeda', 'BRL');
    v_selecao := COALESCE(v_perna->>'selecao', '');
    v_selecao_livre := v_perna->>'selecao_livre';
    v_cotacao_snapshot := (v_perna->>'cotacao_snapshot')::NUMERIC;
    v_stake_brl_referencia := (v_perna->>'stake_brl_referencia')::NUMERIC;
    v_fonte_saldo := COALESCE(v_perna->>'fonte_saldo', 'REAL');
    v_input_ordem := COALESCE((v_perna->>'ordem')::INTEGER, v_perna_idx);

    INSERT INTO apostas_pernas (
      aposta_id, bookmaker_id, ordem, selecao, selecao_livre,
      odd, stake, stake_real, stake_freebet,
      moeda, cotacao_snapshot, stake_brl_referencia, 
      resultado, fonte_saldo
    ) VALUES (
      v_aposta_id, v_bookmaker_id, v_input_ordem, v_selecao, v_selecao_livre,
      v_odd, v_stake, 
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
      v_moeda, v_cotacao_snapshot, v_stake_brl_referencia, 
      NULL, v_fonte_saldo
    )
    RETURNING id INTO v_perna_id;
    
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_id, v_aposta_id, p_workspace_id,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
      'STAKE',
      -v_stake,
      v_moeda,
      'stake_' || v_aposta_id || '_entry' || v_perna_idx,
      'Stake Surebet Entrada ' || v_perna_idx || ' (Perna ' || v_input_ordem || ')' || CASE WHEN v_fonte_saldo = 'FREEBET' THEN ' (FB)' ELSE '' END,
      NOW(), p_user_id
    )
    RETURNING id INTO v_event_id;
    
    v_events_created := v_events_created + 1;
  END LOOP;

  RETURN QUERY SELECT 
    TRUE::BOOLEAN, v_aposta_id, v_events_created,
    format('Surebet criada com %s entradas em %s cenários', v_events_created, array_length(v_leg_ordens, 1))::TEXT;
END;
$function$;

COMMENT ON FUNCTION criar_surebet_atomica IS 
'v13 - Suporte a múltiplas entradas por perna com agrupamento de payout para lucro_esperado correto.';

-- =============================================================================
-- FIX: editar_surebet_completa_v1 (v2)
-- Respeitar 'ordem' enviada pelo frontend
-- =============================================================================

CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v1(
  p_aposta_id uuid,
  p_pernas jsonb,
  p_evento text DEFAULT NULL::text,
  p_esporte text DEFAULT NULL::text,
  p_mercado text DEFAULT NULL::text,
  p_modelo text DEFAULT NULL::text,
  p_estrategia text DEFAULT NULL::text,
  p_contexto text DEFAULT NULL::text,
  p_data_aposta text DEFAULT NULL::text,
  p_stake_total numeric DEFAULT NULL::numeric,
  p_stake_consolidado numeric DEFAULT NULL::numeric,
  p_lucro_esperado numeric DEFAULT NULL::numeric,
  p_roi_esperado numeric DEFAULT NULL::numeric,
  p_lucro_prejuizo numeric DEFAULT NULL::numeric,
  p_roi_real numeric DEFAULT NULL::numeric,
  p_status text DEFAULT NULL::text,
  p_resultado text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta record;
  v_perna record;
  v_existing_ids uuid[];
  v_input_ids uuid[] := '{}';
  v_to_delete uuid[];
  v_perna_id uuid;
  v_workspace_id uuid;
  v_new_count integer := 0;
  v_edited_count integer := 0;
  v_deleted_count integer := 0;
  v_ordem integer := 0;
  v_elem jsonb;
  v_id_text text;
  v_perna_stake numeric;
  v_perna_stake_real numeric;
  v_perna_stake_freebet numeric;
  v_input_ordem integer;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT *
  INTO v_aposta
  FROM public.apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;

  IF COALESCE(v_aposta.forma_registro, '') <> 'ARBITRAGEM' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta rotina edita apenas apostas de arbitragem');
  END IF;

  v_workspace_id := v_aposta.workspace_id;

  SELECT COALESCE(array_agg(id), '{}')
  INTO v_existing_ids
  FROM public.apostas_pernas
  WHERE aposta_id = p_aposta_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas, '[]'::jsonb)) LOOP
    v_id_text := v_elem->>'id';
    IF v_id_text IS NOT NULL AND v_id_text <> '' THEN
      v_input_ids := array_append(v_input_ids, v_id_text::uuid);
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(existing_id), '{}')
  INTO v_to_delete
  FROM unnest(v_existing_ids) AS existing_id
  WHERE existing_id <> ALL(v_input_ids);

  IF array_length(v_to_delete, 1) > 0 THEN
    FOR v_perna_id IN SELECT unnest(v_to_delete) LOOP
      PERFORM public.deletar_perna_surebet_v1(v_perna_id);
      v_deleted_count := v_deleted_count + 1;
    END LOOP;
  END IF;

  v_ordem := 0;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas, '[]'::jsonb)) LOOP
    v_ordem := v_ordem + 1;
    v_id_text := v_elem->>'id';
    v_input_ordem := COALESCE((v_elem->>'ordem')::integer, v_ordem);

    IF v_id_text IS NOT NULL AND v_id_text <> '' THEN
      v_perna_id := v_id_text::uuid;

      SELECT *
      INTO v_perna
      FROM public.apostas_pernas
      WHERE id = v_perna_id;

      IF FOUND THEN
        IF abs(COALESCE(v_perna.stake, 0) - COALESCE((v_elem->>'stake')::numeric, 0)) > 0.00001
          OR abs(COALESCE(v_perna.odd, 0) - COALESCE((v_elem->>'odd')::numeric, 0)) > 0.00001
          OR v_perna.bookmaker_id IS DISTINCT FROM (v_elem->>'bookmaker_id')::uuid
          OR v_perna.selecao IS DISTINCT FROM (v_elem->>'selecao')
          OR COALESCE(v_perna.selecao_livre, '') IS DISTINCT FROM COALESCE(v_elem->>'selecao_livre', '')
        THEN
          PERFORM public.editar_perna_surebet_atomica(
            p_perna_id := v_perna_id,
            p_new_stake := CASE WHEN abs(COALESCE(v_perna.stake, 0) - COALESCE((v_elem->>'stake')::numeric, 0)) > 0.00001 THEN (v_elem->>'stake')::numeric ELSE NULL END,
            p_new_odd := CASE WHEN abs(COALESCE(v_perna.odd, 0) - COALESCE((v_elem->>'odd')::numeric, 0)) > 0.00001 THEN (v_elem->>'odd')::numeric ELSE NULL END,
            p_new_bookmaker_id := CASE WHEN v_perna.bookmaker_id IS DISTINCT FROM (v_elem->>'bookmaker_id')::uuid THEN (v_elem->>'bookmaker_id')::uuid ELSE NULL END,
            p_new_selecao := CASE WHEN v_perna.selecao IS DISTINCT FROM (v_elem->>'selecao') THEN (v_elem->>'selecao') ELSE NULL END,
            p_new_selecao_livre := CASE WHEN COALESCE(v_perna.selecao_livre, '') IS DISTINCT FROM COALESCE(v_elem->>'selecao_livre', '') THEN (v_elem->>'selecao_livre') ELSE NULL END
          );
          v_edited_count := v_edited_count + 1;
        END IF;

        UPDATE public.apostas_pernas
        SET
          ordem = v_input_ordem,
          fonte_saldo = COALESCE(v_elem->>'fonte_saldo', fonte_saldo),
          cotacao_snapshot = COALESCE((v_elem->>'cotacao_snapshot')::numeric, cotacao_snapshot),
          stake_brl_referencia = COALESCE((v_elem->>'stake_brl_referencia')::numeric, stake_brl_referencia)
        WHERE id = v_perna_id;
      ELSE
        v_perna_id := NULL;
        v_id_text := NULL;
      END IF;
    END IF;

    IF v_id_text IS NULL OR v_id_text = '' THEN
      v_perna_stake := COALESCE((v_elem->>'stake')::numeric, 0);
      IF COALESCE(v_elem->>'fonte_saldo', 'REAL') = 'FREEBET' THEN
        v_perna_stake_real := 0;
        v_perna_stake_freebet := v_perna_stake;
      ELSE
        v_perna_stake_real := v_perna_stake;
        v_perna_stake_freebet := 0;
      END IF;

      INSERT INTO public.apostas_pernas (
        aposta_id, bookmaker_id, stake, stake_real, stake_freebet, odd, moeda, selecao, selecao_livre,
        ordem, fonte_saldo, cotacao_snapshot, stake_brl_referencia
      ) VALUES (
        p_aposta_id,
        (v_elem->>'bookmaker_id')::uuid,
        v_perna_stake,
        v_perna_stake_real,
        v_perna_stake_freebet,
        COALESCE((v_elem->>'odd')::numeric, 0),
        COALESCE(v_elem->>'moeda', 'BRL'),
        v_elem->>'selecao',
        v_elem->>'selecao_livre',
        v_input_ordem,
        COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        CASE WHEN v_elem ? 'cotacao_snapshot' AND v_elem->>'cotacao_snapshot' IS NOT NULL THEN (v_elem->>'cotacao_snapshot')::numeric ELSE NULL END,
        CASE WHEN v_elem ? 'stake_brl_referencia' AND v_elem->>'stake_brl_referencia' IS NOT NULL THEN (v_elem->>'stake_brl_referencia')::numeric ELSE NULL END
      );

      INSERT INTO public.financial_events (
        bookmaker_id, workspace_id, aposta_id, created_by,
        tipo_evento, tipo_uso, valor, moeda,
        idempotency_key, descricao, metadata
      ) VALUES (
        (v_elem->>'bookmaker_id')::uuid,
        v_workspace_id,
        p_aposta_id,
        v_aposta.user_id,
        CASE WHEN COALESCE(v_elem->>'fonte_saldo', 'REAL') = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
        CASE WHEN COALESCE(v_elem->>'fonte_saldo', 'REAL') = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
        -v_perna_stake,
        COALESCE(v_elem->>'moeda', 'BRL'),
        'stake_perna_' || p_aposta_id || '_new_' || v_perna_idx || '_' || extract(epoch from now()),
        'Stake nova entrada (edição)',
        jsonb_build_object('perna_ordem', v_input_ordem, 'origem', 'editar_surebet_completa_v1')
      );

      v_new_count := v_new_count + 1;
    END IF;
  END LOOP;

  UPDATE public.apostas_unificada
  SET
    evento = COALESCE(p_evento, evento),
    esporte = COALESCE(p_esporte, esporte),
    mercado = COALESCE(p_mercado, mercado),
    modelo = COALESCE(p_modelo, modelo),
    estrategia = COALESCE(p_estrategia, estrategia),
    contexto_operacional = COALESCE(p_contexto, contexto_operacional),
    data_aposta = CASE WHEN p_data_aposta IS NOT NULL THEN p_data_aposta::timestamptz ELSE data_aposta END,
    stake_total = COALESCE(p_stake_total, stake_total),
    stake_real = (SELECT COALESCE(SUM(ap.stake_real), 0) FROM public.apostas_pernas ap WHERE ap.aposta_id = p_aposta_id),
    stake_freebet = (SELECT COALESCE(SUM(ap.stake_freebet), 0) FROM public.apostas_pernas ap WHERE ap.aposta_id = p_aposta_id),
    stake_consolidado = COALESCE(p_stake_consolidado, stake_consolidado),
    lucro_esperado = COALESCE(p_lucro_esperado, lucro_esperado),
    roi_esperado = COALESCE(p_roi_esperado, roi_esperado),
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, lucro_prejuizo),
    roi_real = COALESCE(p_roi_real, roi_real),
    status = COALESCE(p_status, status),
    resultado = COALESCE(p_resultado, resultado),
    updated_at = now()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object(
    'success', true,
    'edited', v_edited_count,
    'deleted', v_deleted_count,
    'created', v_new_count
  );
END;
$function$;