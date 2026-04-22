-- Fix race condition em liquidar_perna_surebet_v1
-- Quando 3 pernas são liquidadas em paralelo (Promise.all), cada chamada
-- abre sua própria transação, faz UPDATE da sua perna e depois SELECT COUNT(*)
-- para decidir se todas estão liquidadas. Como cada uma só enxerga seu próprio
-- UPDATE (isolation), todas decidem PARCIAL e o pai nunca vira LIQUIDADA.
--
-- FIX: adquirir LOCK no registro pai (apostas_unificada) ANTES de qualquer
-- leitura/escrita. Isso serializa as 3 chamadas — a última vê todas as pernas.

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

  -- 🔧 FIX RACE CONDITION: LOCK do pai antes de prosseguir.
  -- Serializa chamadas paralelas (Promise.all) sobre pernas da mesma aposta,
  -- garantindo que a última transação enxergue todas as pernas atualizadas
  -- antes de decidir entre PARCIAL e LIQUIDADA.
  PERFORM 1 FROM apostas_unificada WHERE id = v_surebet_id FOR UPDATE;

  IF v_old_resultado = p_resultado THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já é o mesmo', 'perna_id', p_perna_id);
  END IF;

  v_is_freebet := (v_fonte_saldo = 'FREEBET');

  -- ============================================================
  -- REVERSÃO DE PAYOUT ANTERIOR (re-liquidação)
  -- ============================================================
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

  -- ============================================================
  -- CRIAR EVENTO PARA O NOVO RESULTADO
  -- ============================================================
  IF p_resultado = 'GREEN' THEN
    v_payout := v_stake_val * v_odd_val;
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao
    ) VALUES (
      v_bookmaker_id, v_surebet_id, p_workspace_id, 'PAYOUT', 'NORMAL',
      'liquidar_perna_v1', v_payout, v_moeda,
      'payout_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
      'Payout GREEN da perna'
    );
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    v_payout := v_stake_val + (v_stake_val * (v_odd_val - 1)) / 2;
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao
    ) VALUES (
      v_bookmaker_id, v_surebet_id, p_workspace_id, 'PAYOUT', 'NORMAL',
      'liquidar_perna_v1', v_payout, v_moeda,
      'payout_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
      'Payout MEIO_GREEN da perna'
    );
  ELSIF p_resultado = 'MEIO_RED' THEN
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

  -- ============================================================
  -- ATUALIZAR PERNA
  -- ============================================================
  UPDATE apostas_pernas
  SET resultado = p_resultado,
      lucro_prejuizo = CASE
        WHEN p_resultado = 'GREEN' THEN v_stake_val * (v_odd_val - 1)
        WHEN p_resultado = 'MEIO_GREEN' THEN (v_stake_val * (v_odd_val - 1)) / 2
        WHEN p_resultado = 'MEIO_RED' THEN -v_stake_val / 2
        WHEN p_resultado = 'VOID' THEN 0
        WHEN p_resultado = 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake_val END
        ELSE 0
      END,
      updated_at = NOW()
  WHERE id = p_perna_id;

  -- ============================================================
  -- RECALCULAR PAI (com lock já adquirido — leituras consistentes)
  -- ============================================================
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
      WHEN p_resultado = 'MEIO_RED' THEN -v_stake_val / 2
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

-- =====================================================================
-- RECONCILIAÇÃO: detectar e corrigir apostas que ficaram PARCIAL
-- mesmo com todas as pernas liquidadas (vítimas do bug anterior).
-- =====================================================================
DO $$
DECLARE
  v_aposta RECORD;
  v_lucro_total NUMERIC;
  v_stake_total NUMERIC;
  v_is_multicurrency BOOLEAN;
  v_pl_consolidado NUMERIC;
  v_stake_consolidado NUMERIC;
  v_consolidation_currency TEXT;
  v_resultado_final TEXT;
  v_todas_liquidadas BOOLEAN;
BEGIN
  FOR v_aposta IN
    SELECT au.id
    FROM apostas_unificada au
    WHERE au.status = 'PARCIAL'
      AND au.forma_registro = 'ARBITRAGEM'
      AND NOT EXISTS (
        SELECT 1 FROM apostas_pernas ap
        WHERE ap.aposta_id = au.id
          AND (ap.resultado IS NULL OR ap.resultado = 'PENDENTE')
      )
      AND EXISTS (SELECT 1 FROM apostas_pernas ap WHERE ap.aposta_id = au.id)
  LOOP
    SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.is_multicurrency,
           r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
    INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_is_multicurrency,
         v_pl_consolidado, v_stake_consolidado, v_consolidation_currency
    FROM fn_recalc_pai_surebet(v_aposta.id) r;

    IF v_lucro_total > 0 THEN v_resultado_final := 'GREEN';
    ELSIF v_lucro_total < 0 THEN v_resultado_final := 'RED';
    ELSE v_resultado_final := 'VOID';
    END IF;

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
    WHERE id = v_aposta.id;

    RAISE NOTICE 'Reconciliada aposta %: % (lucro=%, pl_consolidado=%)',
      v_aposta.id, v_resultado_final, v_lucro_total, v_pl_consolidado;
  END LOOP;
END $$;