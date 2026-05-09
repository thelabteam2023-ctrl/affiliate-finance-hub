-- 1. Reforçar Idempotência no Gatilho Automático
CREATE OR REPLACE FUNCTION public.fn_perna_auto_stake_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_moeda TEXT;
  v_workspace_id UUID;
  v_user_id UUID;
  v_skip TEXT;
BEGIN
  IF NEW.bookmaker_id IS NULL OR COALESCE(NEW.stake, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_skip := current_setting('app.skip_perna_auto_stake', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = 'on' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.financial_events
    WHERE aposta_id = NEW.aposta_id
      AND bookmaker_id = NEW.bookmaker_id
      AND tipo_evento IN ('STAKE', 'FREEBET_STAKE')
      AND (
        idempotency_key = 'stake_perna_' || NEW.id
        OR idempotency_key LIKE 'stake_' || NEW.aposta_id || '%'
        OR idempotency_key LIKE '%perna_' || NEW.id || '%'
        OR idempotency_key LIKE 'edit_perna_' || NEW.id || '%'
      )
  ) THEN
    RETURN NEW;
  END IF;

  SELECT moeda, workspace_id INTO v_moeda, v_workspace_id
  FROM public.bookmakers WHERE id = NEW.bookmaker_id;

  SELECT user_id INTO v_user_id FROM public.apostas_unificada WHERE id = NEW.aposta_id;

  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, created_by
  ) VALUES (
    NEW.bookmaker_id, NEW.aposta_id, v_workspace_id,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR COALESCE(NEW.stake_freebet, 0) > 0 THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR COALESCE(NEW.stake_freebet, 0) > 0 THEN 'FREEBET' ELSE 'NORMAL' END,
    -NEW.stake,
    COALESCE(NEW.moeda, v_moeda),
    'stake_perna_' || NEW.id,
    'Débito automático de stake (Gatilho de Integridade)',
    v_user_id
  );

  RETURN NEW;
END;
$function$;

-- 2. Corrigir deletar_perna_surebet_v1
CREATE OR REPLACE FUNCTION public.deletar_perna_surebet_v1(p_perna_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_perna RECORD;
  v_surebet_id UUID;
  v_ws UUID;
  v_user_id UUID;
  v_bk_id UUID;
  v_moeda TEXT;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_resultado TEXT;
  v_payout NUMERIC := 0;
  v_del_count INT;
  v_remaining_legs INT;
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC;
  v_stake_total NUMERIC;
  v_resultado_final TEXT;
  v_is_multicurrency BOOLEAN;
  v_orig_event_id UUID;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  SELECT ap.id, ap.aposta_id, ap.bookmaker_id, ap.stake, ap.odd, ap.moeda,
         ap.resultado, au.workspace_id, au.user_id
  INTO v_perna
  FROM apostas_pernas ap
  JOIN apostas_unificada au ON au.id = ap.aposta_id
  WHERE ap.id = p_perna_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;
  
  v_surebet_id := v_perna.aposta_id;
  v_ws := v_perna.workspace_id;
  v_user_id := v_perna.user_id;
  v_bk_id := v_perna.bookmaker_id;
  v_moeda := v_perna.moeda;
  v_stake := v_perna.stake;
  v_odd := v_perna.odd;
  v_resultado := v_perna.resultado;
  
  SELECT COUNT(*) INTO v_del_count
  FROM financial_events
  WHERE aposta_id = v_surebet_id
    AND idempotency_key LIKE 'del_perna_' || p_perna_id || '_%';
  
  SELECT id INTO v_orig_event_id FROM financial_events 
  WHERE aposta_id = v_surebet_id AND bookmaker_id = v_bk_id AND tipo_evento IN ('STAKE', 'FREEBET_STAKE')
  ORDER BY created_at DESC LIMIT 1;

  INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at)
  VALUES (v_bk_id, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', v_stake, v_moeda,
          'del_perna_' || p_perna_id || '_rev_stake_n' || v_del_count,
          v_orig_event_id,
          format('Reversão stake (delete perna): %s', v_stake), now());
  
  IF v_resultado IS NOT NULL AND v_resultado NOT IN ('PENDENTE', 'RED') THEN
    v_payout := CASE v_resultado
      WHEN 'GREEN' THEN v_stake * v_odd
      WHEN 'MEIO_GREEN' THEN v_stake + (v_stake * (v_odd - 1) / 2)
      WHEN 'VOID' THEN v_stake
      WHEN 'MEIO_RED' THEN v_stake / 2
      ELSE 0
    END;
    
    IF v_payout > 0 THEN
      SELECT id INTO v_orig_event_id FROM financial_events 
      WHERE aposta_id = v_surebet_id AND bookmaker_id = v_bk_id AND tipo_evento = 'PAYOUT'
      ORDER BY created_at DESC LIMIT 1;

      INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at)
      VALUES (v_bk_id, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', -v_payout, v_moeda,
              'del_perna_' || p_perna_id || '_rev_payout_n' || v_del_count,
              v_orig_event_id,
              format('Reversão payout (delete perna, %s): %s', v_resultado, v_payout), now());
    END IF;
  END IF;
  
  DELETE FROM apostas_pernas WHERE id = p_perna_id;
  
  SELECT COUNT(*) INTO v_remaining_legs
  FROM apostas_pernas WHERE aposta_id = v_surebet_id;
  
  IF v_remaining_legs = 0 THEN
    UPDATE apostas_unificada SET
      status = 'CANCELADA', stake_total = 0, lucro_prejuizo = 0, roi_real = 0, updated_at = now()
    WHERE id = v_surebet_id;
  ELSE
    SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency
    INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency
    FROM fn_recalc_pai_surebet(v_surebet_id) r;

    UPDATE apostas_unificada SET
      stake_total = v_stake_total,
      lucro_prejuizo = CASE WHEN v_todas_liquidadas THEN v_lucro_total ELSE NULL END,
      is_multicurrency = v_is_multicurrency,
      roi_real = CASE WHEN v_todas_liquidadas AND v_stake_total > 0 
        THEN (v_lucro_total / v_stake_total) * 100 ELSE NULL END,
      updated_at = now()
    WHERE id = v_surebet_id;
  END IF;
  
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 3. Robustecer deletar_aposta_v4
CREATE OR REPLACE FUNCTION public.deletar_aposta_v4(p_aposta_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
  v_leg_balance NUMERIC;
BEGIN
  SELECT * INTO v_aposta FROM public.apostas_unificada au WHERE au.id = p_aposta_id FOR UPDATE;

  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;

  FOR v_event IN
    SELECT id, bookmaker_id, tipo_evento, valor, moeda, tipo_uso, workspace_id
    FROM public.financial_events
    WHERE aposta_id = p_aposta_id
      AND tipo_evento NOT IN ('REVERSAL')
      AND id NOT IN (SELECT COALESCE(reversed_event_id, '00000000-0000-0000-0000-000000000000'::uuid) FROM public.financial_events WHERE aposta_id = p_aposta_id AND tipo_evento = 'REVERSAL')
  LOOP
    SELECT SUM(valor) INTO v_leg_balance FROM public.financial_events 
    WHERE aposta_id = p_aposta_id AND bookmaker_id = v_event.bookmaker_id;

    IF v_leg_balance != 0 THEN
      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at
      ) VALUES (
        v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
        -v_event.valor, v_event.moeda,
        'del_rev_' || v_event.id,
        v_event.id,
        format('Reversão por exclusão (%s)', v_event.tipo_evento),
        now()
      ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END LOOP;

  DELETE FROM public.apostas_perna_entradas ape 
  USING public.apostas_pernas ap 
  WHERE ape.perna_id = ap.id AND ap.aposta_id = p_aposta_id;

  DELETE FROM public.apostas_pernas ap WHERE ap.aposta_id = p_aposta_id;
  DELETE FROM public.apostas_unificada au WHERE au.id = p_aposta_id;

  RETURN QUERY SELECT TRUE, 'Aposta excluída com sucesso'::TEXT;
END;
$function$;

-- 4. Corrigir editar_surebet_completa_v1 (DROP e CREATE para evitar erro de troca de nome de parâmetro)
DROP FUNCTION IF EXISTS public.editar_surebet_completa_v1(uuid,jsonb,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text);

CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v1(p_aposta_id uuid, p_pernas jsonb, p_evento text DEFAULT NULL::text, p_esporte text DEFAULT NULL::text, p_mercado text DEFAULT NULL::text, p_modelo text DEFAULT NULL::text, p_estrategia text DEFAULT NULL::text, p_contexto text DEFAULT NULL::text, p_data_aposta text DEFAULT NULL::text, p_stake_total numeric DEFAULT NULL::numeric, p_stake_consolidado numeric DEFAULT NULL::numeric, p_lucro_esperado numeric DEFAULT NULL::numeric, p_roi_esperado numeric DEFAULT NULL::numeric, p_lucro_prejuizo numeric DEFAULT NULL::numeric, p_roi_real numeric DEFAULT NULL::numeric, p_status text DEFAULT NULL::text, p_resultado text DEFAULT NULL::text)
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
  -- Silenciar gatilho automático
  PERFORM set_config('app.skip_perna_auto_stake', 'on', true);
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada'); END IF;
  IF COALESCE(v_aposta.forma_registro, '') <> 'ARBITRAGEM' THEN RETURN jsonb_build_object('success', false, 'error', 'Apenas arbitragem'); END IF;

  v_workspace_id := v_aposta.workspace_id;

  SELECT COALESCE(array_agg(id), '{}') INTO v_existing_ids FROM public.apostas_pernas WHERE aposta_id = p_aposta_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas, '[]'::jsonb)) LOOP
    v_id_text := v_elem->>'id';
    IF v_id_text IS NOT NULL AND v_id_text <> '' THEN v_input_ids := array_append(v_input_ids, v_id_text::uuid); END IF;
  END LOOP;

  SELECT COALESCE(array_agg(existing_id), '{}') INTO v_to_delete FROM unnest(v_existing_ids) AS existing_id WHERE existing_id <> ALL(v_input_ids);

  IF array_length(v_to_delete, 1) > 0 THEN
    FOR v_perna_id IN SELECT unnest(v_to_delete) LOOP
      PERFORM public.deletar_perna_surebet_v1(v_perna_id);
      v_deleted_count := v_deleted_count + 1;
    END LOOP;
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas, '[]'::jsonb)) LOOP
    v_ordem := v_ordem + 1;
    v_id_text := v_elem->>'id';
    v_input_ordem := COALESCE((v_elem->>'ordem')::integer, v_ordem);

    IF v_id_text IS NOT NULL AND v_id_text <> '' THEN
      v_perna_id := v_id_text::uuid;
      SELECT * INTO v_perna FROM public.apostas_pernas WHERE id = v_perna_id;
      IF FOUND THEN
        IF abs(COALESCE(v_perna.stake, 0) - COALESCE((v_elem->>'stake')::numeric, 0)) > 0.00001
           OR v_perna.bookmaker_id IS DISTINCT FROM (v_elem->>'bookmaker_id')::uuid
        THEN
          PERFORM public.editar_perna_surebet_atomica(v_perna_id, (v_elem->>'stake')::numeric, (v_elem->>'odd')::numeric, (v_elem->>'bookmaker_id')::uuid);
          v_edited_count := v_edited_count + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.apostas_unificada SET
    evento = COALESCE(p_evento, evento),
    esporte = COALESCE(p_esporte, esporte),
    status = COALESCE(p_status, status),
    updated_at = now()
  WHERE id = p_aposta_id;

  PERFORM set_config('app.skip_perna_auto_stake', 'off', true);
  RETURN jsonb_build_object('success', true);
END;
$function$;
