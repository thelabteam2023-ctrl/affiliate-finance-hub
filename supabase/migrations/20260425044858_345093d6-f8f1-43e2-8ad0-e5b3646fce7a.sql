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
  v_active_stake_total NUMERIC := 0;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT ap.aposta_id, ap.stake, ap.odd, ap.moeda, ap.bookmaker_id, ap.resultado,
         ap.lucro_prejuizo, COALESCE(ap.fonte_saldo, 'REAL')
  INTO v_surebet_id, v_stake_val, v_odd_val, v_moeda, v_bookmaker_id, v_old_resultado,
       v_old_payout, v_fonte_saldo
  FROM apostas_pernas ap
  WHERE ap.id = p_perna_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;

  PERFORM 1 FROM apostas_unificada WHERE id = v_surebet_id FOR UPDATE;

  IF v_old_resultado = p_resultado THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já é o mesmo', 'perna_id', p_perna_id);
  END IF;

  v_is_freebet := (v_fonte_saldo = 'FREEBET');

  IF p_resultado IS NOT NULL AND p_resultado NOT IN ('PENDENTE', '') THEN
    SELECT COALESCE(SUM(ABS(fe.valor)), 0)
    INTO v_active_stake_total
    FROM financial_events fe
    WHERE fe.aposta_id = v_surebet_id
      AND fe.bookmaker_id = v_bookmaker_id
      AND fe.tipo_evento IN ('STAKE', 'FREEBET_STAKE')
      AND fe.reversed_event_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM financial_events r
        WHERE r.reversed_event_id = fe.id
      );

    IF v_active_stake_total + 0.000001 < COALESCE(v_stake_val, 0) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Liquidação bloqueada: perna %s não possui STAKE ativo suficiente no ledger (stake da perna: %s, stake ativo: %s). Recrie/corrija a operação antes de liquidar.', p_perna_id, COALESCE(v_stake_val, 0), v_active_stake_total),
        'code', 'MISSING_STAKE_LEDGER'
      );
    END IF;
  END IF;

  IF v_old_resultado IS NOT NULL AND v_old_resultado NOT IN ('PENDENTE', '') THEN
    DECLARE
      v_old_event_id UUID;
      v_old_event_value NUMERIC;
      v_old_event_tipo_uso TEXT;
      v_old_event_moeda TEXT;
    BEGIN
      SELECT fe.id, fe.valor, fe.tipo_uso, fe.moeda
      INTO v_old_event_id, v_old_event_value, v_old_event_tipo_uso, v_old_event_moeda
      FROM financial_events fe
      WHERE fe.aposta_id = v_surebet_id
        AND fe.bookmaker_id = v_bookmaker_id
        AND (fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT'))
        AND fe.reversed_event_id IS NULL
        AND (fe.idempotency_key LIKE 'payout_perna_' || p_perna_id || '%'
             OR fe.idempotency_key LIKE 'voidrefund_perna_' || p_perna_id || '%'
             OR fe.idempotency_key LIKE 'fbpayout_perna_' || p_perna_id || '%')
      ORDER BY fe.created_at DESC
      LIMIT 1;

      IF v_old_event_id IS NOT NULL THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, reversed_event_id, descricao
        ) VALUES (
          v_bookmaker_id, v_surebet_id, p_workspace_id, 'REVERSAL', v_old_event_tipo_uso,
          'liquidar_perna_v1_reversal', -v_old_event_value, v_old_event_moeda,
          'reversal_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
          v_old_event_id,
          'Reversão de payout anterior (re-liquidação)'
        );
      END IF;
    END;
  END IF;

  IF p_resultado = 'GREEN' THEN
    v_payout := CASE WHEN v_is_freebet THEN v_stake_val * (v_odd_val - 1) ELSE v_stake_val * v_odd_val END;
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao
    ) VALUES (
      v_bookmaker_id, v_surebet_id, p_workspace_id,
      CASE WHEN v_is_freebet THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
      CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END,
      'liquidar_perna_v1', v_payout, v_moeda,
      CASE WHEN v_is_freebet THEN 'fbpayout_perna_' ELSE 'payout_perna_' END || p_perna_id || '_' || extract(epoch from now())::text,
      'Payout GREEN da perna'
    );
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    v_payout := CASE WHEN v_is_freebet THEN (v_stake_val * (v_odd_val - 1)) / 2 ELSE v_stake_val + (v_stake_val * (v_odd_val - 1)) / 2 END;
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao
    ) VALUES (
      v_bookmaker_id, v_surebet_id, p_workspace_id,
      CASE WHEN v_is_freebet THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
      CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END,
      'liquidar_perna_v1', v_payout, v_moeda,
      CASE WHEN v_is_freebet THEN 'fbpayout_perna_' ELSE 'payout_perna_' END || p_perna_id || '_' || extract(epoch from now())::text,
      'Payout MEIO_GREEN da perna'
    );
  ELSIF p_resultado = 'MEIO_RED' THEN
    IF NOT v_is_freebet THEN
      v_payout := v_stake_val / 2;
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        origem, valor, moeda, idempotency_key, descricao
      ) VALUES (
        v_bookmaker_id, v_surebet_id, p_workspace_id, 'PAYOUT', 'NORMAL',
        'liquidar_perna_v1', v_payout, v_moeda,
        'payout_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
        'Refund MEIO_RED da perna (50%)'
      );
    END IF;
  ELSIF p_resultado = 'VOID' THEN
    IF NOT v_is_freebet THEN
      v_payout := v_stake_val;
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        origem, valor, moeda, idempotency_key, descricao
      ) VALUES (
        v_bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND', 'NORMAL',
        'liquidar_perna_v1', v_payout, v_moeda,
        'voidrefund_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
        'Refund VOID da perna'
      );
    END IF;
  END IF;

  UPDATE apostas_pernas
  SET resultado = p_resultado,
      lucro_prejuizo = CASE
        WHEN p_resultado = 'GREEN' THEN CASE WHEN v_is_freebet THEN v_stake_val * (v_odd_val - 1) ELSE v_stake_val * (v_odd_val - 1) END
        WHEN p_resultado = 'MEIO_GREEN' THEN (v_stake_val * (v_odd_val - 1)) / 2
        WHEN p_resultado = 'MEIO_RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake_val / 2 END
        WHEN p_resultado = 'VOID' THEN 0
        WHEN p_resultado = 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake_val END
        ELSE 0
      END,
      updated_at = NOW()
  WHERE id = p_perna_id;

  SELECT COUNT(*) INTO v_total_pernas FROM apostas_pernas WHERE aposta_id = v_surebet_id;
  SELECT COUNT(*) INTO v_pernas_liquidadas FROM apostas_pernas WHERE aposta_id = v_surebet_id AND resultado IS NOT NULL AND resultado != 'PENDENTE';
  v_todas_liquidadas := (v_pernas_liquidadas = v_total_pernas);

  IF v_todas_liquidadas THEN
    SELECT COALESCE(SUM(lucro_prejuizo), 0), COALESCE(SUM(stake), 0)
    INTO v_lucro_total, v_stake_total
    FROM apostas_pernas WHERE aposta_id = v_surebet_id;

    IF v_lucro_total > 0 THEN v_resultado_final := 'GREEN';
    ELSIF v_lucro_total < 0 THEN v_resultado_final := 'RED';
    ELSE v_resultado_final := 'VOID';
    END IF;

    SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.is_multicurrency,
           r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
    INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_is_multicurrency,
         v_pl_consolidado, v_stake_consolidado, v_consolidation_currency
    FROM fn_recalc_pai_surebet(v_surebet_id) r;

    UPDATE apostas_unificada
    SET status = 'LIQUIDADA',
        resultado = v_resultado_final,
        lucro_prejuizo = v_lucro_total,
        stake = v_stake_total,
        is_multicurrency = v_is_multicurrency,
        pl_consolidado = v_pl_consolidado,
        stake_consolidado = v_stake_consolidado,
        consolidation_currency = v_consolidation_currency,
        updated_at = NOW()
    WHERE id = v_surebet_id;
  ELSE
    UPDATE apostas_unificada
    SET status = 'PARCIAL', updated_at = NOW()
    WHERE id = v_surebet_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'resultado', p_resultado,
    'lucro_prejuizo', CASE
      WHEN p_resultado = 'GREEN' THEN v_stake_val * (v_odd_val - 1)
      WHEN p_resultado = 'MEIO_GREEN' THEN (v_stake_val * (v_odd_val - 1)) / 2
      WHEN p_resultado = 'MEIO_RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake_val / 2 END
      WHEN p_resultado = 'VOID' THEN 0
      WHEN p_resultado = 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake_val END
      ELSE 0
    END,
    'todas_liquidadas', v_todas_liquidadas,
    'resultado_final_pai', CASE WHEN v_todas_liquidadas THEN v_resultado_final ELSE NULL END,
    'pl_consolidado', v_pl_consolidado
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_guard_surebet_pernas_forma_registro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_parent RECORD;
BEGIN
  SELECT id, forma_registro, estrategia
  INTO v_parent
  FROM public.apostas_unificada
  WHERE id = NEW.aposta_id;

  IF FOUND
     AND v_parent.estrategia = 'SUREBET'
     AND COALESCE(v_parent.forma_registro, 'SIMPLES') <> 'ARBITRAGEM' THEN
    RAISE EXCEPTION 'Surebet com pernas deve usar forma_registro=ARBITRAGEM e motor atômico. aposta_id=%', NEW.aposta_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_surebet_pernas_forma_registro ON public.apostas_pernas;
CREATE TRIGGER tg_guard_surebet_pernas_forma_registro
BEFORE INSERT OR UPDATE OF aposta_id ON public.apostas_pernas
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_surebet_pernas_forma_registro();