-- Correção do bug crítico: PAYOUT de Freebet (SNR) deve ir para saldo REAL, não para saldo_freebet
-- Regra de negócio: quando uma freebet ganha, o lucro (odd-1)*stake é dinheiro REAL pago pela casa
-- A stake da freebet é "consumida" (Stake Not Returned) e não retorna

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

  -- Reversão de payout anterior (re-liquidação)
  IF v_old_resultado IS NOT NULL AND v_old_resultado NOT IN ('PENDENTE', '') THEN
    IF v_old_payout IS NOT NULL AND v_old_payout != 0 THEN
      -- IMPORTANTE: a reversão deve usar o mesmo tipo_uso do PAYOUT original
      -- Para freebet, payouts antigos podem ter sido lançados como FREEBET (bug) ou NORMAL (após correção).
      -- Vamos detectar olhando o último PAYOUT/VOID_REFUND não-revertido para esta perna.
      DECLARE
        v_old_tipo_uso TEXT;
        v_reversal_amount NUMERIC;
      BEGIN
        SELECT tipo_uso INTO v_old_tipo_uso
        FROM financial_events
        WHERE aposta_id = v_surebet_id
          AND bookmaker_id = v_bookmaker_id
          AND tipo_evento IN ('PAYOUT','VOID_REFUND')
          AND idempotency_key LIKE 'payout_perna_' || p_perna_id || '%' 
              OR idempotency_key LIKE 'void_perna_' || p_perna_id || '%'
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_old_tipo_uso IS NULL THEN
          v_old_tipo_uso := CASE WHEN v_is_freebet AND v_old_resultado = 'VOID' THEN 'FREEBET' ELSE 'NORMAL' END;
        END IF;

        -- Para FREEBET SNR ganha: o payout original = lucro (odd-1)*stake. Reversão = -lucro
        -- Para REAL: payout original = stake*odd. Reversão = -(payout + stake) histórico... mantemos lógica antiga
        IF v_is_freebet AND v_old_resultado IN ('GREEN','MEIO_GREEN','MEIO_RED') THEN
          v_reversal_amount := -v_old_payout;
        ELSE
          v_reversal_amount := -(v_old_payout + v_stake_val);
        END IF;

        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, created_by,
          tipo_evento, tipo_uso, origem, valor, moeda,
          idempotency_key, descricao
        ) VALUES (
          v_bookmaker_id, v_surebet_id, p_workspace_id,
          (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
          'REVERSAL', v_old_tipo_uso, 'REVERSAL',
          v_reversal_amount, v_moeda,
          'reversal_perna_' || p_perna_id || '_' || extract(epoch from now()),
          'Reversão payout perna (reliquidação)'
        );
      END;
    END IF;

    IF v_old_resultado = 'VOID' THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, created_by,
        tipo_evento, tipo_uso, origem, valor, moeda,
        idempotency_key, descricao
      ) VALUES (
        v_bookmaker_id, v_surebet_id, p_workspace_id,
        (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
        'REVERSAL', CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END, 'REVERSAL',
        -v_stake_val, v_moeda,
        'reversal_void_perna_' || p_perna_id || '_' || extract(epoch from now()),
        'Reversão VOID refund perna (reliquidação)'
      );
    END IF;
  END IF;

  -- Cálculo do payout
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

  -- VOID: para freebet, devolve a freebet (FREEBET). Para real, devolve dinheiro real (NORMAL).
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
    -- 🔧 FIX CRÍTICO: PAYOUT de freebet SNR sempre vai para saldo REAL (NORMAL)
    -- Antes: tipo_uso = FREEBET inflava saldo_freebet incorretamente
    -- Agora: tipo_uso = NORMAL credita o lucro real no saldo_atual
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, created_by,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao
    ) VALUES (
      v_bookmaker_id, v_surebet_id, p_workspace_id,
      (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
      'PAYOUT', 'NORMAL', 'PAYOUT',
      v_payout, v_moeda,
      'payout_perna_' || p_perna_id || '_' || extract(epoch from now()),
      format('Payout perna surebet (%s)%s', p_resultado, CASE WHEN v_is_freebet THEN ' [FB->REAL]' ELSE '' END)
    );
  END IF;

  -- Atualizar perna
  UPDATE apostas_pernas
  SET resultado = p_resultado,
      lucro_prejuizo = CASE
        WHEN p_resultado = 'GREEN' THEN
          CASE WHEN v_is_freebet THEN v_stake_val * (v_odd_val - 1) ELSE v_stake_val * (v_odd_val - 1) END
        WHEN p_resultado = 'MEIO_GREEN' THEN
          CASE WHEN v_is_freebet THEN (v_stake_val * (v_odd_val - 1)) / 2 ELSE (v_stake_val * (v_odd_val - 1)) / 2 END
        WHEN p_resultado = 'MEIO_RED' THEN -v_stake_val / 2
        WHEN p_resultado = 'VOID' THEN 0
        WHEN p_resultado = 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake_val END
        ELSE 0
      END,
      updated_at = NOW()
  WHERE id = p_perna_id;

  -- Recalcular pai (mantém lógica original)
  SELECT COUNT(*) INTO v_total_pernas FROM apostas_pernas WHERE aposta_id = v_surebet_id;
  SELECT COUNT(*) INTO v_pernas_liquidadas FROM apostas_pernas WHERE aposta_id = v_surebet_id AND resultado IS NOT NULL AND resultado != 'PENDENTE';
  v_todas_liquidadas := (v_pernas_liquidadas = v_total_pernas);

  IF v_todas_liquidadas THEN
    SELECT COALESCE(SUM(lucro_prejuizo), 0), COALESCE(SUM(stake), 0)
    INTO v_lucro_total, v_stake_total
    FROM apostas_pernas WHERE aposta_id = v_surebet_id;

    IF v_lucro_total > 0 THEN v_resultado_final := 'GREEN';
    ELSIF v_lucro_total < 0 THEN v_resultado_final := 'RED';
    ELSE v_resultado_final := 'VOID'; END IF;

    UPDATE apostas_unificada
    SET status = 'LIQUIDADA',
        resultado = v_resultado_final,
        lucro_prejuizo = v_lucro_total,
        updated_at = NOW()
    WHERE id = v_surebet_id;
  END IF;

  -- Recalcular pai multimoeda se aplicável
  BEGIN
    PERFORM fn_recalc_pai_surebet(v_surebet_id);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'resultado', p_resultado,
    'payout', v_payout,
    'fonte_saldo', v_fonte_saldo,
    'tipo_uso_payout', 'NORMAL',
    'todas_liquidadas', v_todas_liquidadas
  );
END;
$function$;