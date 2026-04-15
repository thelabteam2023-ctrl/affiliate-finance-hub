
-- Drop the broken version
DROP FUNCTION IF EXISTS public.liquidar_perna_surebet_v1(uuid, uuid, text, text, text, uuid);

-- Recreate with correct column mapping
CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(
  p_surebet_id uuid,
  p_perna_id uuid,
  p_resultado text,
  p_resultado_anterior text DEFAULT NULL,
  p_fonte_saldo text DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_perna RECORD;
  v_aposta RECORD;
  v_bookmaker RECORD;
  v_payout numeric;
  v_old_payout numeric;
  v_event_key text;
  v_reversal_key text;
  v_count int;
  v_resultado_final text;
  v_total_pernas int;
  v_pernas_liquidadas int;
  v_all_green boolean;
  v_all_red boolean;
  v_has_void boolean;
  v_has_meio boolean;
  v_stake_val numeric;
  v_odd_val numeric;
  v_actual_fonte_saldo text;
  v_ws_id uuid;
  v_tipo_evento_payout text;
BEGIN
  -- 1. Fetch perna
  SELECT * INTO v_perna FROM apostas_pernas WHERE id = p_perna_id AND aposta_id = p_surebet_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perna % não encontrada para surebet %', p_perna_id, p_surebet_id;
  END IF;

  -- 2. Fetch parent bet
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_surebet_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Surebet % não encontrada', p_surebet_id;
  END IF;

  -- 3. Guard: same result = no-op
  IF v_perna.resultado IS NOT NULL AND v_perna.resultado = p_resultado THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já é ' || p_resultado, 'no_op', true);
  END IF;

  -- 4. Fetch bookmaker
  SELECT * INTO v_bookmaker FROM bookmakers WHERE id = v_perna.bookmaker_id;

  -- Determine actual fonte_saldo
  v_actual_fonte_saldo := COALESCE(p_fonte_saldo, v_perna.fonte_saldo, v_aposta.fonte_saldo, 'NORMAL');
  v_ws_id := COALESCE(p_workspace_id, v_aposta.workspace_id);

  -- Determine payout event type based on fonte_saldo
  IF v_actual_fonte_saldo = 'FREEBET' THEN
    v_tipo_evento_payout := 'FREEBET_PAYOUT';
  ELSE
    v_tipo_evento_payout := 'PAYOUT';
  END IF;

  -- 5. Compute stake and odd
  v_stake_val := abs(v_perna.stake);
  v_odd_val := v_perna.odd;

  -- 6. Compute payout based on resultado
  CASE p_resultado
    WHEN 'GREEN' THEN
      v_payout := v_stake_val * v_odd_val;
    WHEN 'RED' THEN
      v_payout := 0;
    WHEN 'MEIO_GREEN' THEN
      v_payout := v_stake_val + (v_stake_val * (v_odd_val - 1)) / 2;
    WHEN 'MEIO_RED' THEN
      v_payout := v_stake_val / 2;
    WHEN 'VOID' THEN
      v_payout := v_stake_val;
    ELSE
      RAISE EXCEPTION 'Resultado inválido: %', p_resultado;
  END CASE;

  -- 7. If re-liquidation, reverse previous payout
  IF v_perna.resultado IS NOT NULL AND v_perna.resultado != 'PENDENTE' THEN
    -- Calculate old payout
    CASE v_perna.resultado
      WHEN 'GREEN' THEN v_old_payout := v_stake_val * v_odd_val;
      WHEN 'RED' THEN v_old_payout := 0;
      WHEN 'MEIO_GREEN' THEN v_old_payout := v_stake_val + (v_stake_val * (v_odd_val - 1)) / 2;
      WHEN 'MEIO_RED' THEN v_old_payout := v_stake_val / 2;
      WHEN 'VOID' THEN v_old_payout := v_stake_val;
      ELSE v_old_payout := 0;
    END CASE;

    IF v_old_payout > 0 THEN
      SELECT count(*) INTO v_count FROM financial_events
        WHERE idempotency_key LIKE 'rev_payout_perna_' || p_perna_id::text || '%';
      
      v_reversal_key := 'rev_payout_perna_' || p_perna_id::text || '_n' || (v_count + 1)::text;
      
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id,
        tipo_evento, valor, tipo_uso, origem, moeda,
        idempotency_key, created_by
      ) VALUES (
        v_perna.bookmaker_id,
        p_surebet_id,
        v_ws_id,
        'REVERSAL',
        -v_old_payout,  -- negative for reversal
        'NORMAL',
        'LUCRO',
        COALESCE(v_perna.moeda, v_bookmaker.moeda, 'BRL'),
        v_reversal_key,
        v_aposta.user_id
      );
    END IF;
  END IF;

  -- 8. Create PAYOUT event (only if payout > 0)
  IF v_payout > 0 THEN
    SELECT count(*) INTO v_count FROM financial_events
      WHERE idempotency_key LIKE 'payout_perna_' || p_perna_id::text || '%';
    
    v_event_key := 'payout_perna_' || p_perna_id::text || '_n' || (v_count + 1)::text;
    
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id,
      tipo_evento, valor, tipo_uso, origem, moeda,
      idempotency_key, created_by
    ) VALUES (
      v_perna.bookmaker_id,
      p_surebet_id,
      v_ws_id,
      CASE WHEN p_resultado = 'VOID' THEN 'VOID_REFUND' ELSE v_tipo_evento_payout END,
      v_payout,  -- positive for credit
      'NORMAL',
      'LUCRO',
      COALESCE(v_perna.moeda, v_bookmaker.moeda, 'BRL'),
      v_event_key,
      v_aposta.user_id
    );
  END IF;

  -- 9. Update perna
  UPDATE apostas_pernas SET
    resultado = p_resultado,
    lucro_prejuizo = v_payout - v_stake_val,
    updated_at = now()
  WHERE id = p_perna_id;

  -- 10. Recalculate parent status
  SELECT count(*) INTO v_total_pernas FROM apostas_pernas WHERE aposta_id = p_surebet_id;
  SELECT count(*) INTO v_pernas_liquidadas FROM apostas_pernas 
    WHERE aposta_id = p_surebet_id AND resultado IS NOT NULL AND resultado != 'PENDENTE';

  IF v_pernas_liquidadas = v_total_pernas THEN
    -- All legs resolved: use fn_recalc_pai_surebet for proper P&L
    BEGIN
      PERFORM fn_recalc_pai_surebet(p_surebet_id);
      -- Get the result to set on parent
      SELECT r.resultado_final INTO v_resultado_final
      FROM fn_recalc_pai_surebet(p_surebet_id) r;
    EXCEPTION WHEN undefined_function THEN
      -- Fallback manual calculation
      SELECT bool_and(resultado = 'GREEN') INTO v_all_green
        FROM apostas_pernas WHERE aposta_id = p_surebet_id AND resultado IS NOT NULL AND resultado != 'PENDENTE';
      SELECT bool_and(resultado = 'RED') INTO v_all_red
        FROM apostas_pernas WHERE aposta_id = p_surebet_id AND resultado IS NOT NULL AND resultado != 'PENDENTE';
      SELECT bool_or(resultado = 'VOID') INTO v_has_void FROM apostas_pernas WHERE aposta_id = p_surebet_id;
      SELECT bool_or(resultado IN ('MEIO_GREEN', 'MEIO_RED')) INTO v_has_meio FROM apostas_pernas WHERE aposta_id = p_surebet_id;

      IF v_all_green THEN v_resultado_final := 'GREEN';
      ELSIF v_all_red THEN v_resultado_final := 'RED';
      ELSIF v_has_void AND NOT v_has_meio AND v_all_green IS NOT TRUE AND v_all_red IS NOT TRUE THEN v_resultado_final := 'VOID';
      ELSE v_resultado_final := 'GREEN';
      END IF;
    END;

    -- Use fn_recalc results to update parent with proper P&L
    UPDATE apostas_unificada SET
      resultado = COALESCE(v_resultado_final, 'GREEN'),
      status = 'LIQUIDADA',
      updated_at = now()
    WHERE id = p_surebet_id;

    -- Also apply consolidated values from fn_recalc
    BEGIN
      UPDATE apostas_unificada au SET
        lucro_prejuizo = r.lucro_total,
        stake_total = r.stake_total,
        is_multicurrency = r.is_multicurrency,
        pl_consolidado = r.pl_consolidado,
        stake_consolidado = r.stake_consolidado,
        consolidation_currency = r.consolidation_currency,
        roi_real = CASE WHEN r.stake_total > 0 THEN ROUND((r.lucro_total / r.stake_total) * 100, 2) ELSE 0 END
      FROM fn_recalc_pai_surebet(p_surebet_id) r
      WHERE au.id = p_surebet_id;
    EXCEPTION WHEN undefined_function THEN
      -- Already handled above
      NULL;
    END;
  ELSE
    -- Not all legs resolved yet
    UPDATE apostas_unificada SET
      status = 'PENDENTE',
      updated_at = now()
    WHERE id = p_surebet_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'resultado', p_resultado,
    'payout', v_payout,
    'lucro_prejuizo', v_payout - v_stake_val
  );
END;
$function$;
