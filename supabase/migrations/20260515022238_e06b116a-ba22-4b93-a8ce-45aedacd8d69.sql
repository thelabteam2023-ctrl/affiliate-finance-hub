-- Drop first because parameters have default values in existing version but not in new version (or vice versa)
DROP FUNCTION IF EXISTS public.editar_perna_surebet_atomica(uuid,numeric,numeric,uuid,text,text);

CREATE OR REPLACE FUNCTION public.editar_perna_surebet_atomica(
  p_perna_id uuid, 
  p_new_stake numeric DEFAULT NULL, 
  p_new_odd numeric DEFAULT NULL, 
  p_new_bookmaker_id uuid DEFAULT NULL, 
  p_new_selecao text DEFAULT NULL, 
  p_new_selecao_livre text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_perna RECORD;
  v_ws UUID;
  v_surebet_id UUID;
  v_old_stake NUMERIC;
  v_old_odd NUMERIC;
  v_old_bk UUID;
  v_eff_stake NUMERIC;
  v_eff_odd NUMERIC;
  v_resultado TEXT;
  v_old_payout NUMERIC := 0;
  v_new_payout NUMERIC := 0;
  v_payout_diff NUMERIC;
  v_stake_diff NUMERIC;
  v_moeda TEXT;
  v_user_id UUID;
  v_edit_count INT;
  v_saldo_atual NUMERIC;
  v_stake_increase NUMERIC;
  v_target_bk UUID;
  v_old_stake_real NUMERIC;
  v_old_stake_freebet NUMERIC;
  v_new_stake_real NUMERIC;
  v_new_stake_freebet NUMERIC;
  v_orig_stake_event_id UUID;
  v_orig_payout_event_id UUID;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  
  SELECT ap.*, au.workspace_id, au.user_id
  INTO v_perna
  FROM apostas_pernas ap
  JOIN apostas_unificada au ON au.id = ap.aposta_id
  WHERE ap.id = p_perna_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;
  
  v_ws := v_perna.workspace_id;
  v_surebet_id := v_perna.aposta_id;
  v_old_stake := v_perna.stake;
  v_old_odd := v_perna.odd;
  v_old_bk := v_perna.bookmaker_id;
  v_old_stake_real := COALESCE(v_perna.stake_real, v_old_stake);
  v_old_stake_freebet := COALESCE(v_perna.stake_freebet, 0);
  v_eff_stake := COALESCE(p_new_stake, v_old_stake);
  v_eff_odd := COALESCE(p_new_odd, v_old_odd);
  v_resultado := v_perna.resultado;
  v_moeda := v_perna.moeda;
  v_user_id := v_perna.user_id;

  -- Calcular novos stakes real/freebet mantendo a proporção
  IF p_new_stake IS NOT NULL AND p_new_stake != v_old_stake THEN
    IF v_old_stake > 0 THEN
      v_new_stake_real := ROUND((v_old_stake_real / v_old_stake) * p_new_stake, 2);
      v_new_stake_freebet := ROUND(p_new_stake - v_new_stake_real, 2);
    ELSE
      v_new_stake_real := p_new_stake;
      v_new_stake_freebet := 0;
    END IF;
  ELSE
    v_new_stake_real := v_old_stake_real;
    v_new_stake_freebet := v_old_stake_freebet;
  END IF;

  v_target_bk := COALESCE(p_new_bookmaker_id, v_old_bk);
  
  -- Validar saldo se stake aumentou
  IF v_eff_stake > v_old_stake THEN
    v_stake_increase := v_eff_stake - v_old_stake;
    SELECT saldo_atual INTO v_saldo_atual FROM bookmakers WHERE id = v_target_bk;
    IF v_saldo_atual < v_stake_increase THEN
      RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente na casa para alteração');
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_edit_count FROM financial_events 
  WHERE aposta_id = v_surebet_id AND idempotency_key LIKE 'edit_perna_' || p_perna_id || '_%';

  -- Localizar eventos originais para vincular a reversão
  SELECT id INTO v_orig_stake_event_id FROM financial_events 
  WHERE aposta_id = v_surebet_id AND bookmaker_id = v_old_bk AND tipo_evento IN ('STAKE', 'FREEBET_STAKE') 
  AND reversed_event_id IS NULL ORDER BY created_at ASC LIMIT 1;

  -- CASO 1: Mudança de Bookmaker
  IF p_new_bookmaker_id IS NOT NULL AND p_new_bookmaker_id != v_old_bk THEN
    -- Reverter no antigo (VINCULADO ao original)
    INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, reversed_event_id, descricao)
    VALUES (v_old_bk, v_surebet_id, v_ws, v_user_id, 'REVERSAL', v_perna.fonte_saldo, 'REVERSAL', v_old_stake, v_moeda,
            'edit_perna_' || p_perna_id || '_bk_rev_stake_n' || v_edit_count, v_orig_stake_event_id,
            format('Reversão stake (mudança bookmaker): %s', v_old_stake));
    
    -- Novo Stake no novo
    INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao)
    VALUES (p_new_bookmaker_id, v_surebet_id, v_ws, v_user_id, 'STAKE', v_perna.fonte_saldo, 'APOSTA', -v_eff_stake, v_moeda,
            'edit_perna_' || p_perna_id || '_bk_new_stake_n' || v_edit_count,
            format('Stake em novo bookmaker: %s', v_eff_stake));
    
    -- Tratar Payout se já liquidada
    IF v_resultado IS NOT NULL AND v_resultado NOT IN ('PENDENTE', 'RED') THEN
      v_old_payout := CASE v_resultado
        WHEN 'GREEN' THEN v_old_stake * v_old_odd
        WHEN 'MEIO_GREEN' THEN v_old_stake + (v_old_stake * (v_old_odd - 1) / 2)
        WHEN 'VOID' THEN v_old_stake
        WHEN 'MEIO_RED' THEN v_old_stake / 2
        ELSE 0
      END;

      SELECT id INTO v_orig_payout_event_id FROM financial_events 
      WHERE aposta_id = v_surebet_id AND bookmaker_id = v_old_bk AND tipo_evento IN ('PAYOUT', 'FREEBET_PAYOUT')
      AND reversed_event_id IS NULL ORDER BY created_at ASC LIMIT 1;

      IF v_old_payout > 0 THEN
        INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, reversed_event_id, descricao)
        VALUES (v_old_bk, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', -v_old_payout, v_moeda,
                'edit_perna_' || p_perna_id || '_bk_rev_pay_n' || v_edit_count, v_orig_payout_event_id,
                format('Reversão payout antigo bk: %s', v_old_payout));
      END IF;

      v_new_payout := CASE v_resultado
        WHEN 'GREEN' THEN v_eff_stake * v_eff_odd
        WHEN 'MEIO_GREEN' THEN v_eff_stake + (v_eff_stake * (v_eff_odd - 1) / 2)
        WHEN 'VOID' THEN v_eff_stake
        WHEN 'MEIO_RED' THEN v_eff_stake / 2
        ELSE 0
      END;

      IF v_new_payout > 0 THEN
        INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao)
        VALUES (p_new_bookmaker_id, v_surebet_id, v_ws, v_user_id, 'PAYOUT', 'NORMAL', 'LUCRO', v_new_payout, v_moeda,
                'edit_perna_' || p_perna_id || '_bk_new_pay_n' || v_edit_count,
                format('Payout novo bk: %s', v_new_payout));
      END IF;
    END IF;

  -- CASO 2: Apenas mudança de Stake/Odd no mesmo Bookmaker
  ELSE
    v_stake_diff := v_eff_stake - v_old_stake;
    IF v_stake_diff != 0 THEN
      INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao)
      VALUES (v_old_bk, v_surebet_id, v_ws, v_user_id, 'AJUSTE', v_perna.fonte_saldo, 'AJUSTE', -v_stake_diff, v_moeda,
              'edit_perna_' || p_perna_id || '_stake_' || v_old_stake || '_to_' || v_eff_stake || '_n' || v_edit_count,
              format('Ajuste stake: %s → %s', v_old_stake, v_eff_stake));
    END IF;

    IF v_resultado IS NOT NULL AND v_resultado NOT IN ('PENDENTE', 'RED') THEN
      v_old_payout := CASE v_resultado
        WHEN 'GREEN' THEN v_old_stake * v_old_odd
        WHEN 'MEIO_GREEN' THEN v_old_stake + (v_old_stake * (v_old_odd - 1) / 2)
        WHEN 'VOID' THEN v_old_stake
        WHEN 'MEIO_RED' THEN v_old_stake / 2
        ELSE 0
      END;
      v_new_payout := CASE v_resultado
        WHEN 'GREEN' THEN v_eff_stake * v_eff_odd
        WHEN 'MEIO_GREEN' THEN v_eff_stake + (v_eff_stake * (v_eff_odd - 1) / 2)
        WHEN 'VOID' THEN v_eff_stake
        WHEN 'MEIO_RED' THEN v_eff_stake / 2
        ELSE 0
      END;
      v_payout_diff := v_new_payout - v_old_payout;
      IF v_payout_diff != 0 THEN
        INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao)
        VALUES (v_old_bk, v_surebet_id, v_ws, v_user_id, 'AJUSTE', 'NORMAL', 'AJUSTE', v_payout_diff, v_moeda,
                'edit_perna_' || p_perna_id || '_pay_' || v_old_payout || '_to_' || v_new_payout || '_n' || v_edit_count,
                format('Ajuste payout: %s → %s', v_old_payout, v_new_payout));
      END IF;
    END IF;
  END IF;

  UPDATE apostas_pernas SET
    stake = v_eff_stake,
    stake_real = v_new_stake_real,
    stake_freebet = v_new_stake_freebet,
    odd = v_eff_odd,
    bookmaker_id = v_target_bk,
    selecao = COALESCE(p_new_selecao, selecao),
    selecao_livre = COALESCE(p_new_selecao_livre, selecao_livre),
    updated_at = now()
  WHERE id = p_perna_id;

  -- Sync entries table (BUG 3 FIX)
  UPDATE public.apostas_perna_entradas SET
    bookmaker_id = v_target_bk,
    stake = v_eff_stake,
    odd = v_eff_odd,
    stake_real = v_new_stake_real,
    stake_freebet = v_new_stake_freebet,
    updated_at = now()
  WHERE perna_id = p_perna_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v1(p_aposta_id uuid, p_pernas jsonb, p_evento text, p_esporte text, p_mercado text, p_modelo text, p_estrategia text, p_contexto text, p_data_aposta timestamp with time zone, p_stake_total numeric, p_stake_consolidado numeric, p_lucro_esperado numeric, p_roi_esperado numeric, p_lucro_prejuizo numeric, p_roi_real numeric, p_status text, p_resultado text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_elem jsonb;
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
BEGIN
  -- Silenciar gatilhos automáticos de perna individual para controle atômico
  PERFORM set_config('app.skip_perna_auto_stake', 'on', true);
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada'); END IF;
  
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;

  -- 1. Identificar pernas a deletar
  SELECT COALESCE(array_agg(id), '{}') INTO v_existing_ids FROM public.apostas_pernas WHERE aposta_id = p_aposta_id;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas, '[]'::jsonb)) LOOP
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
  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas, '[]'::jsonb)) LOOP
    v_ordem := v_ordem + 1;
    v_id_text := v_elem->>'id';

    IF v_id_text IS NOT NULL AND v_id_text <> '' THEN
      -- EDITAR perna existente
      v_res := public.editar_perna_surebet_atomica(
        v_id_text::uuid, 
        (v_elem->>'stake')::numeric, 
        (v_elem->>'odd')::numeric, 
        (v_elem->>'bookmaker_id')::uuid,
        (v_elem->>'selecao')::text,
        (v_elem->>'selecao_livre')::text
      );
      
      IF NOT (v_res->>'success')::boolean THEN
        RAISE EXCEPTION '%', (v_res->>'error');
      END IF;
    ELSE
      -- CRIAR nova perna (cobertura adicionada na edição)
      INSERT INTO public.apostas_pernas (
        aposta_id, bookmaker_id, ordem, selecao, selecao_livre, odd, stake, moeda, fonte_saldo, 
        cotacao_snapshot, stake_brl_referencia
      ) VALUES (
        p_aposta_id, (v_elem->>'bookmaker_id')::uuid, v_ordem, (v_elem->>'selecao')::text, (v_elem->>'selecao_livre')::text,
        (v_elem->>'odd')::numeric, (v_elem->>'stake')::numeric, COALESCE((v_elem->>'moeda')::text, 'BRL'),
        COALESCE((v_elem->>'fonte_saldo')::text, 'REAL'), (v_elem->>'cotacao_snapshot')::numeric, 
        (v_elem->>'stake_brl_referencia')::numeric
      ) RETURNING id INTO v_perna_id;

      -- Sync entry for new leg
      INSERT INTO public.apostas_perna_entradas (
        perna_id, bookmaker_id, odd, stake, moeda, fonte_saldo, cotacao_snapshot, stake_brl_referencia
      ) VALUES (
        v_perna_id, (v_elem->>'bookmaker_id')::uuid, (v_elem->>'odd')::numeric, (v_elem->>'stake')::numeric,
        COALESCE((v_elem->>'moeda')::text, 'BRL'), COALESCE((v_elem->>'fonte_saldo')::text, 'REAL'),
        (v_elem->>'cotacao_snapshot')::numeric, (v_elem->>'stake_brl_referencia')::numeric
      );

      -- Gerar evento STAKE para a nova perna
      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, descricao
      ) VALUES (
        (v_elem->>'bookmaker_id')::uuid, p_aposta_id, v_workspace_id, v_user_id, 'STAKE', 
        COALESCE((v_elem->>'fonte_saldo')::text, 'REAL'), 'APOSTA', -(v_elem->>'stake')::numeric, 
        COALESCE((v_elem->>'moeda')::text, 'BRL'), 'Stake (nova perna adicionada na edição)'
      );
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
    status = COALESCE(p_status, status),
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
