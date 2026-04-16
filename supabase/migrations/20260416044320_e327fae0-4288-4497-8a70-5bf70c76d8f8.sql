-- Fix: align RPCs to fn_recalc_pai_surebet's renamed column (resultado_final → resultado_geral)

CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(p_perna_id uuid, p_resultado text, p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_perna RECORD;
  v_surebet_id UUID;
  v_stake_val NUMERIC;
  v_odd_val NUMERIC;
  v_moeda TEXT;
  v_bookmaker_id UUID;
  v_payout NUMERIC := 0;
  v_old_resultado TEXT;
  v_old_payout NUMERIC;
  v_fonte_saldo TEXT;
  v_is_freebet BOOLEAN;
  v_total_pernas INT;
  v_pernas_liquidadas INT;
  v_resultado_final TEXT;
  v_event_count INT;
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC;
  v_stake_total NUMERIC;
  v_is_multicurrency BOOLEAN;
  v_pl_consolidado NUMERIC;
  v_stake_consolidado NUMERIC;
  v_consolidation_currency TEXT;
BEGIN
  SELECT ap.aposta_id, ap.stake, ap.odd, ap.moeda, ap.bookmaker_id, ap.resultado,
         ap.lucro_prejuizo, COALESCE(ap.fonte_saldo, 'REAL')
  INTO v_surebet_id, v_stake_val, v_odd_val, v_moeda, v_bookmaker_id, v_old_resultado,
       v_old_payout, v_fonte_saldo
  FROM apostas_pernas ap
  WHERE ap.id = p_perna_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;

  IF v_old_resultado = p_resultado THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já é o mesmo', 'perna_id', p_perna_id);
  END IF;

  v_is_freebet := (v_fonte_saldo = 'FREEBET');

  IF v_old_resultado IS NOT NULL AND v_old_resultado NOT IN ('PENDENTE', '') THEN
    IF v_old_payout IS NOT NULL AND v_old_payout != 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, created_by,
        tipo_evento, tipo_uso, origem, valor, moeda,
        idempotency_key, descricao
      ) VALUES (
        v_bookmaker_id, v_surebet_id, p_workspace_id,
        (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
        'REVERSAL', 'NORMAL', 'REVERSAL',
        -(v_old_payout + v_stake_val), v_moeda,
        'reversal_perna_' || p_perna_id || '_' || extract(epoch from now()),
        'Reversão payout perna (reliquidação)'
      );
    END IF;

    IF v_old_resultado = 'VOID' THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, created_by,
        tipo_evento, tipo_uso, origem, valor, moeda,
        idempotency_key, descricao
      ) VALUES (
        v_bookmaker_id, v_surebet_id, p_workspace_id,
        (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
        'REVERSAL', 'NORMAL', 'REVERSAL',
        -v_stake_val, v_moeda,
        'reversal_void_perna_' || p_perna_id || '_' || extract(epoch from now()),
        'Reversão VOID refund perna (reliquidação)'
      );
    END IF;
  END IF;

  IF p_resultado = 'GREEN' THEN
    v_payout := CASE WHEN v_is_freebet THEN v_stake_val * (v_odd_val - 1) ELSE v_stake_val * v_odd_val END;
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    v_payout := CASE WHEN v_is_freebet THEN (v_stake_val * (v_odd_val - 1)) / 2 ELSE v_stake_val + ((v_stake_val * v_odd_val) - v_stake_val) / 2 END;
  ELSIF p_resultado = 'MEIO_RED' THEN
    v_payout := v_stake_val / 2;
  ELSIF p_resultado = 'VOID' THEN
    v_payout := v_stake_val;
  ELSE
    v_payout := 0;
  END IF;

  IF p_resultado = 'VOID' THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, created_by,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao
    ) VALUES (
      v_bookmaker_id, v_surebet_id, p_workspace_id,
      (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
      'VOID_REFUND', CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END, 'VOID_REFUND',
      v_stake_val, v_moeda,
      'void_perna_' || p_perna_id || '_' || extract(epoch from now()),
      'VOID refund perna surebet'
    );
  ELSIF v_payout > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, created_by,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao
    ) VALUES (
      v_bookmaker_id, v_surebet_id, p_workspace_id,
      (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
      'PAYOUT', CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END, 'PAYOUT',
      v_payout, v_moeda,
      'payout_perna_' || p_perna_id || '_' || extract(epoch from now()),
      format('Payout perna surebet (%s)', p_resultado)
    );
  END IF;

  UPDATE apostas_pernas SET
    resultado = p_resultado,
    lucro_prejuizo = v_payout - v_stake_val,
    updated_at = now()
  WHERE id = p_perna_id;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE resultado IS NOT NULL AND resultado NOT IN ('PENDENTE', ''))
  INTO v_total_pernas, v_pernas_liquidadas
  FROM apostas_pernas WHERE aposta_id = v_surebet_id;

  IF v_pernas_liquidadas = v_total_pernas THEN
    BEGIN
      SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral,
             r.is_multicurrency, r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
      INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final,
           v_is_multicurrency, v_pl_consolidado, v_stake_consolidado, v_consolidation_currency
      FROM fn_recalc_pai_surebet(v_surebet_id) r;
    EXCEPTION WHEN undefined_function THEN
      SELECT 
        CASE WHEN SUM(CASE WHEN ap.lucro_prejuizo > 0 THEN 1 ELSE 0 END) > 0 
             AND SUM(ap.lucro_prejuizo) >= 0 THEN 'GREEN'
             WHEN SUM(ap.lucro_prejuizo) > 0 THEN 'GREEN'
             WHEN SUM(ap.lucro_prejuizo) < 0 THEN 'RED'
             ELSE 'VOID' END
      INTO v_resultado_final
      FROM apostas_pernas ap WHERE ap.aposta_id = v_surebet_id;
      
      v_lucro_total := NULL;
      v_stake_total := NULL;
      v_is_multicurrency := NULL;
      v_pl_consolidado := NULL;
      v_stake_consolidado := NULL;
      v_consolidation_currency := NULL;
    END;

    UPDATE apostas_unificada SET
      resultado = COALESCE(v_resultado_final, 'GREEN'),
      status = 'LIQUIDADA',
      lucro_prejuizo = v_lucro_total,
      pl_consolidado = v_pl_consolidado,
      stake_consolidado = v_stake_consolidado,
      is_multicurrency = COALESCE(v_is_multicurrency, is_multicurrency),
      consolidation_currency = COALESCE(v_consolidation_currency, consolidation_currency),
      roi_real = CASE WHEN v_stake_total > 0 THEN ROUND((v_lucro_total / v_stake_total) * 100, 2) ELSE 0 END,
      updated_at = now()
    WHERE id = v_surebet_id;
  ELSE
    UPDATE apostas_unificada SET
      status = 'PENDENTE',
      updated_at = now()
    WHERE id = v_surebet_id;
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


-- Fix deletar_perna_surebet_v1: resultado_final → resultado_geral
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
BEGIN
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
  
  INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
  VALUES (gen_random_uuid(), v_bk_id, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', v_stake, v_moeda,
          'del_perna_' || p_perna_id || '_rev_stake_n' || v_del_count,
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
      INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
      VALUES (gen_random_uuid(), v_bk_id, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', -v_payout, v_moeda,
              'del_perna_' || p_perna_id || '_rev_payout_n' || v_del_count,
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
  
  RETURN jsonb_build_object(
    'success', true, 'perna_id', p_perna_id, 'surebet_id', v_surebet_id,
    'stake_revertida', v_stake, 'payout_revertido', v_payout, 'pernas_restantes', v_remaining_legs
  );
END;
$function$;


-- Fix editar_perna_surebet_atomica: resultado_final → resultado_geral
CREATE OR REPLACE FUNCTION public.editar_perna_surebet_atomica(p_perna_id uuid, p_new_stake numeric DEFAULT NULL::numeric, p_new_odd numeric DEFAULT NULL::numeric, p_new_bookmaker_id uuid DEFAULT NULL::uuid, p_new_selecao text DEFAULT NULL::text, p_new_selecao_livre text DEFAULT NULL::text)
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
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC;
  v_stake_total NUMERIC;
  v_resultado_final TEXT;
  v_is_multicurrency BOOLEAN;
BEGIN
  SELECT ap.id, ap.aposta_id, ap.bookmaker_id, ap.stake, ap.odd, ap.moeda,
         ap.resultado, ap.fonte_saldo, ap.stake_real, ap.stake_freebet,
         au.workspace_id, au.user_id
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

  IF p_new_stake IS NOT NULL AND p_new_stake != v_old_stake THEN
    IF v_old_stake > 0 THEN
      v_new_stake_real := ROUND((v_old_stake_real / v_old_stake) * p_new_stake, 2);
      v_new_stake_freebet := ROUND(p_new_stake - v_new_stake_real, 2);
      IF v_new_stake_freebet < 0 THEN
        v_new_stake_real := p_new_stake;
        v_new_stake_freebet := 0;
      END IF;
    ELSE
      v_new_stake_real := p_new_stake;
      v_new_stake_freebet := 0;
    END IF;
  ELSE
    v_new_stake_real := v_old_stake_real;
    v_new_stake_freebet := v_old_stake_freebet;
  END IF;

  v_target_bk := COALESCE(p_new_bookmaker_id, v_old_bk);
  
  IF v_eff_stake > v_old_stake THEN
    v_stake_increase := v_eff_stake - v_old_stake;
    SELECT saldo_atual INTO v_saldo_atual FROM bookmakers WHERE id = v_target_bk;
    IF v_saldo_atual IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Bookmaker não encontrado');
    END IF;
    IF v_saldo_atual < v_stake_increase THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Saldo insuficiente. Disponível: %s, necessário: %s', v_saldo_atual, v_stake_increase),
        'saldo_disponivel', v_saldo_atual, 'stake_aumento', v_stake_increase
      );
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_edit_count
  FROM financial_events
  WHERE aposta_id = v_surebet_id
    AND idempotency_key LIKE 'edit_perna_' || p_perna_id || '_%';

  IF p_new_bookmaker_id IS NOT NULL AND p_new_bookmaker_id != v_old_bk THEN
    INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
    VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', v_old_stake, v_moeda,
            'edit_perna_' || p_perna_id || '_bk_rev_stake_n' || v_edit_count,
            format('Reversão stake (mudança bookmaker): %s', v_old_stake), now());
    
    INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
    VALUES (gen_random_uuid(), p_new_bookmaker_id, v_surebet_id, v_ws, v_user_id, 'STAKE', 'NORMAL', 'APOSTA', -v_eff_stake, v_moeda,
            'edit_perna_' || p_perna_id || '_bk_new_stake_n' || v_edit_count,
            format('Stake em novo bookmaker: %s', v_eff_stake), now());
    
    IF v_resultado IS NOT NULL AND v_resultado NOT IN ('PENDENTE', 'RED') THEN
      v_old_payout := CASE v_resultado
        WHEN 'GREEN' THEN v_old_stake * v_old_odd
        WHEN 'MEIO_GREEN' THEN v_old_stake + (v_old_stake * (v_old_odd - 1) / 2)
        WHEN 'VOID' THEN v_old_stake
        WHEN 'MEIO_RED' THEN v_old_stake / 2
        ELSE 0
      END;
      
      IF v_old_payout > 0 THEN
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', -v_old_payout, v_moeda,
                'edit_perna_' || p_perna_id || '_bk_rev_pay_n' || v_edit_count,
                format('Reversão payout antigo bk: %s', v_old_payout), now());
      END IF;
      
      v_new_payout := CASE v_resultado
        WHEN 'GREEN' THEN v_eff_stake * v_eff_odd
        WHEN 'MEIO_GREEN' THEN v_eff_stake + (v_eff_stake * (v_eff_odd - 1) / 2)
        WHEN 'VOID' THEN v_eff_stake
        WHEN 'MEIO_RED' THEN v_eff_stake / 2
        ELSE 0
      END;
      
      IF v_new_payout > 0 THEN
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), p_new_bookmaker_id, v_surebet_id, v_ws, v_user_id, 'PAYOUT', 'NORMAL', 'LUCRO', v_new_payout, v_moeda,
                'edit_perna_' || p_perna_id || '_bk_new_pay_n' || v_edit_count,
                format('Payout novo bk: %s', v_new_payout), now());
      END IF;
    END IF;
  ELSE
    v_stake_diff := v_eff_stake - v_old_stake;
    IF v_stake_diff != 0 THEN
      INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
      VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'AJUSTE', 'NORMAL', 'AJUSTE',
              -v_stake_diff, v_moeda,
              'edit_perna_' || p_perna_id || '_stake_' || v_old_stake || '_to_' || v_eff_stake || '_n' || v_edit_count,
              format('Ajuste stake: %s → %s', v_old_stake, v_eff_stake), now());
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
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'AJUSTE', 'NORMAL', 'AJUSTE',
                v_payout_diff, v_moeda,
                'edit_perna_' || p_perna_id || '_pay_' || v_old_payout || '_to_' || v_new_payout || '_n' || v_edit_count,
                format('Ajuste payout: %s → %s', v_old_payout, v_new_payout), now());
      END IF;
    END IF;
  END IF;

  UPDATE apostas_pernas SET
    stake = v_eff_stake,
    stake_real = v_new_stake_real,
    stake_freebet = v_new_stake_freebet,
    odd = v_eff_odd,
    bookmaker_id = COALESCE(p_new_bookmaker_id, bookmaker_id),
    selecao = COALESCE(p_new_selecao, selecao),
    selecao_livre = COALESCE(p_new_selecao_livre, selecao_livre),
    lucro_prejuizo = CASE
      WHEN v_resultado IS NOT NULL AND v_resultado != 'PENDENTE' THEN
        CASE v_resultado
          WHEN 'GREEN' THEN v_eff_stake * (v_eff_odd - 1)
          WHEN 'MEIO_GREEN' THEN (v_eff_stake * (v_eff_odd - 1)) / 2
          WHEN 'RED' THEN -v_eff_stake
          WHEN 'MEIO_RED' THEN -v_eff_stake / 2
          WHEN 'VOID' THEN 0
          ELSE lucro_prejuizo
        END
      ELSE lucro_prejuizo
    END,
    updated_at = now()
  WHERE id = p_perna_id;
  
  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency
  FROM fn_recalc_pai_surebet(v_surebet_id) r;

  UPDATE apostas_unificada SET
    stake_total = v_stake_total,
    stake_real = (SELECT COALESCE(SUM(stake_real), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id),
    stake_freebet = (SELECT COALESCE(SUM(stake_freebet), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id),
    lucro_prejuizo = CASE WHEN v_todas_liquidadas THEN v_lucro_total ELSE lucro_prejuizo END,
    is_multicurrency = v_is_multicurrency,
    roi_real = CASE WHEN v_todas_liquidadas AND v_stake_total > 0 
      THEN (v_lucro_total / v_stake_total) * 100 ELSE roi_real END,
    updated_at = now()
  WHERE id = v_surebet_id;
  
  RETURN jsonb_build_object(
    'success', true, 'perna_id', p_perna_id,
    'old_stake', v_old_stake, 'new_stake', v_eff_stake,
    'old_odd', v_old_odd, 'new_odd', v_eff_odd,
    'stake_real', v_new_stake_real, 'stake_freebet', v_new_stake_freebet,
    'saldo_validado', true
  );
END;
$function$;