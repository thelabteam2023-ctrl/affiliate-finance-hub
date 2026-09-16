CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v1(
  p_aposta_id uuid, p_pernas jsonb, p_evento text, p_esporte text, p_mercado text,
  p_modelo text, p_estrategia text, p_contexto text, p_data_aposta timestamp with time zone,
  p_stake_total numeric, p_stake_consolidado numeric, p_lucro_esperado numeric,
  p_roi_esperado numeric, p_lucro_prejuizo numeric, p_roi_real numeric,
  p_status text, p_resultado text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_elem jsonb;
  v_ent jsonb;
  v_entradas jsonb;
  v_id_text text;
  v_perna_id uuid;
  v_existing_ids uuid[];
  v_input_ids uuid[] := '{}';
  v_to_delete uuid[];
  v_workspace_id uuid;
  v_user_id uuid;
  v_ordem integer := 0;
  v_todas_liquidadas BOOLEAN;
  v_calc_lucro_total NUMERIC;
  v_calc_stake_total NUMERIC;
  v_calc_resultado_final TEXT;
  v_calc_is_multicurrency BOOLEAN;
  v_res jsonb;
  v_pernas jsonb := '[]'::jsonb;
BEGIN
  PERFORM set_config('app.skip_perna_auto_stake', 'on', true);
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada'); END IF;

  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;

  -- 0. Ignorar pernas vazias (slots não preenchidos do formulário)
  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas, '[]'::jsonb)) LOOP
    IF COALESCE(v_elem->>'bookmaker_id','') <> ''
       AND COALESCE((v_elem->>'stake')::numeric, 0) > 0
       AND COALESCE((v_elem->>'odd')::numeric, 0) > 0 THEN
      v_pernas := v_pernas || jsonb_build_array(v_elem);
    END IF;
  END LOOP;

  -- 1. Identificar pernas a deletar
  SELECT COALESCE(array_agg(id), '{}') INTO v_existing_ids FROM public.apostas_pernas WHERE aposta_id = p_aposta_id;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_pernas) LOOP
    v_id_text := v_elem->>'id';
    IF v_id_text IS NOT NULL AND v_id_text <> '' THEN v_input_ids := array_append(v_input_ids, v_id_text::uuid); END IF;
  END LOOP;
  SELECT COALESCE(array_agg(id), '{}') INTO v_to_delete FROM unnest(v_existing_ids) AS id WHERE id <> ALL(v_input_ids);

  IF array_length(v_to_delete, 1) > 0 THEN
    FOR v_perna_id IN SELECT unnest(v_to_delete) LOOP
      v_res := public.deletar_perna_surebet_v1(v_perna_id);
      IF NOT (v_res->>'success')::boolean THEN
        RAISE EXCEPTION '%', (v_res->>'error');
      END IF;
    END LOOP;
  END IF;

  -- 2. Processar pernas (Edição ou Criação)
  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_pernas) LOOP
    v_ordem := v_ordem + 1;
    v_id_text := v_elem->>'id';
    v_entradas := NULLIF(v_elem->'entradas', 'null'::jsonb);
    IF v_entradas IS NOT NULL AND jsonb_typeof(v_entradas) <> 'array' THEN
      v_entradas := NULL;
    END IF;
    IF v_entradas IS NOT NULL AND jsonb_array_length(v_entradas) = 0 THEN
      v_entradas := NULL;
    END IF;

    IF v_id_text IS NOT NULL AND v_id_text <> '' THEN
      -- EDITAR perna existente (consciente de múltiplas entradas)
      v_res := public.editar_perna_surebet_v2(
        v_id_text::uuid,
        (v_elem->>'stake')::numeric,
        (v_elem->>'odd')::numeric,
        (v_elem->>'bookmaker_id')::uuid,
        (v_elem->>'selecao')::text,
        (v_elem->>'selecao_livre')::text,
        COALESCE((v_elem->>'fonte_saldo')::text, 'REAL'),
        v_entradas
      );

      IF NOT (v_res->>'success')::boolean THEN
        RAISE EXCEPTION '%', (v_res->>'error');
      END IF;

      UPDATE public.apostas_pernas SET ordem = v_ordem WHERE id = v_id_text::uuid;
    ELSE
      -- CRIAR nova perna
      INSERT INTO public.apostas_pernas (
        aposta_id, bookmaker_id, ordem, selecao, selecao_livre, odd, stake, moeda, fonte_saldo,
        stake_real, stake_freebet, cotacao_snapshot, stake_brl_referencia
      ) VALUES (
        p_aposta_id, (v_elem->>'bookmaker_id')::uuid, v_ordem, (v_elem->>'selecao')::text, (v_elem->>'selecao_livre')::text,
        (v_elem->>'odd')::numeric, (v_elem->>'stake')::numeric, COALESCE((v_elem->>'moeda')::text, 'BRL'),
        COALESCE((v_elem->>'fonte_saldo')::text, 'REAL'),
        CASE WHEN COALESCE(v_elem->>'fonte_saldo','REAL') = 'FREEBET' THEN 0 ELSE (v_elem->>'stake')::numeric END,
        CASE WHEN COALESCE(v_elem->>'fonte_saldo','REAL') = 'FREEBET' THEN (v_elem->>'stake')::numeric ELSE 0 END,
        (v_elem->>'cotacao_snapshot')::numeric,
        (v_elem->>'stake_brl_referencia')::numeric
      ) RETURNING id INTO v_perna_id;

      IF v_entradas IS NULL THEN
        v_entradas := jsonb_build_array(jsonb_build_object(
          'bookmaker_id', v_elem->>'bookmaker_id',
          'odd', v_elem->>'odd',
          'stake', v_elem->>'stake',
          'moeda', COALESCE(v_elem->>'moeda','BRL'),
          'fonte_saldo', COALESCE(v_elem->>'fonte_saldo','REAL'),
          'cotacao_snapshot', v_elem->>'cotacao_snapshot',
          'stake_brl_referencia', v_elem->>'stake_brl_referencia'
        ));
      END IF;

      FOR v_ent IN SELECT * FROM jsonb_array_elements(v_entradas) LOOP
        INSERT INTO public.apostas_perna_entradas (
          perna_id, bookmaker_id, odd, stake, moeda, fonte_saldo,
          stake_real, stake_freebet, cotacao_snapshot, stake_brl_referencia
        ) VALUES (
          v_perna_id, (v_ent->>'bookmaker_id')::uuid, (v_ent->>'odd')::numeric, (v_ent->>'stake')::numeric,
          COALESCE(v_ent->>'moeda', COALESCE(v_elem->>'moeda','BRL')), COALESCE(v_ent->>'fonte_saldo','REAL'),
          CASE WHEN COALESCE(v_ent->>'fonte_saldo','REAL') = 'FREEBET' THEN 0 ELSE (v_ent->>'stake')::numeric END,
          CASE WHEN COALESCE(v_ent->>'fonte_saldo','REAL') = 'FREEBET' THEN (v_ent->>'stake')::numeric ELSE 0 END,
          (v_ent->>'cotacao_snapshot')::numeric, (v_ent->>'stake_brl_referencia')::numeric
        );

        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, descricao, processed_at
        ) VALUES (
          (v_ent->>'bookmaker_id')::uuid, p_aposta_id, v_workspace_id, v_user_id,
          CASE WHEN COALESCE(v_ent->>'fonte_saldo','REAL') = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
          CASE WHEN COALESCE(v_ent->>'fonte_saldo','REAL') = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
          'APOSTA', -(v_ent->>'stake')::numeric,
          COALESCE(v_ent->>'moeda', COALESCE(v_elem->>'moeda','BRL')),
          'Stake de nova perna (edição)', now()
        );
      END LOOP;

      -- Consolidar totais da perna a partir das entradas
      UPDATE public.apostas_pernas p SET
        stake = t.total, stake_real = t.real_, stake_freebet = t.fb,
        odd = CASE WHEN t.total > 0 THEN t.odd_pond ELSE p.odd END,
        updated_at = now()
      FROM (
        SELECT COALESCE(sum(stake),0) total, COALESCE(sum(stake_real),0) real_, COALESCE(sum(stake_freebet),0) fb,
               CASE WHEN COALESCE(sum(stake),0) > 0 THEN sum(odd*stake)/sum(stake) ELSE max(odd) END odd_pond
        FROM public.apostas_perna_entradas WHERE perna_id = v_perna_id
      ) t
      WHERE p.id = v_perna_id;
    END IF;
  END LOOP;

  -- 3. Recalcular e Atualizar Registro Pai
  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency
  INTO v_todas_liquidadas, v_calc_lucro_total, v_calc_stake_total, v_calc_resultado_final, v_calc_is_multicurrency
  FROM fn_recalc_pai_surebet(p_aposta_id) r;

  UPDATE public.apostas_unificada SET
    evento = COALESCE(p_evento, evento),
    esporte = COALESCE(p_esporte, esporte),
    mercado = COALESCE(p_mercado, mercado),
    modelo = COALESCE(p_modelo, modelo),
    estrategia = COALESCE(p_estrategia, estrategia),
    contexto_operacional = COALESCE(p_contexto, contexto_operacional),
    data_aposta = COALESCE(p_data_aposta::timestamp with time zone, data_aposta),
    stake_total = v_calc_stake_total,
    stake_consolidado = COALESCE(p_stake_consolidado, stake_consolidado),
    lucro_esperado = COALESCE(p_lucro_esperado, lucro_esperado),
    roi_esperado = COALESCE(p_roi_esperado, roi_esperado),
    is_multicurrency = v_calc_is_multicurrency,
    status = COALESCE(p_status, CASE WHEN v_todas_liquidadas THEN status ELSE 'PENDENTE' END),
    resultado = COALESCE(p_resultado, resultado),
    lucro_prejuizo = CASE WHEN v_todas_liquidadas THEN v_calc_lucro_total ELSE COALESCE(p_lucro_prejuizo, lucro_prejuizo) END,
    roi_real = CASE WHEN v_todas_liquidadas AND v_calc_stake_total > 0 THEN (v_calc_lucro_total / v_calc_stake_total) * 100 ELSE roi_real END,
    updated_at = now()
  WHERE id = p_aposta_id;

  PERFORM set_config('app.skip_perna_auto_stake', 'off', true);
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.skip_perna_auto_stake', 'off', true);
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;