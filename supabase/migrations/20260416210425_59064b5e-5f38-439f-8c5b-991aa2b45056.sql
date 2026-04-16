
CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(
  p_perna_id uuid, 
  p_resultado text, 
  p_workspace_id uuid
)
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

  -- ============================================================
  -- REVERSÃO DE PAYOUT ANTERIOR (re-liquidação)
  -- 🔧 FIX: busca o ÚLTIMO PAYOUT/VOID_REFUND real desta perna no ledger
  --        e estorna o valor EXATO (não usa mais lucro_prejuizo da perna)
  -- 🔧 FIX: parênteses no OR para isolar por aposta+bookmaker+perna
  -- ============================================================
  IF v_old_resultado IS NOT NULL AND v_old_resultado NOT IN ('PENDENTE', '') THEN
    DECLARE
      v_old_event_id UUID;
      v_old_event_value NUMERIC;
      v_old_event_tipo_uso TEXT;
      v_old_event_moeda TEXT;
    BEGIN
      -- Encontrar o último PAYOUT ou VOID_REFUND desta perna que NÃO foi revertido
      SELECT fe.id, fe.valor, fe.tipo_uso, fe.moeda
      INTO v_old_event_id, v_old_event_value, v_old_event_tipo_uso, v_old_event_moeda
      FROM financial_events fe
      WHERE fe.aposta_id = v_surebet_id
        AND fe.bookmaker_id = v_bookmaker_id
        AND fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND')
        AND (
          fe.idempotency_key LIKE 'payout_perna_' || p_perna_id || '%'
          OR fe.idempotency_key LIKE 'void_perna_' || p_perna_id || '%'
        )
        AND NOT EXISTS (
          SELECT 1 FROM financial_events fr
          WHERE fr.reversed_event_id = fe.id
        )
      ORDER BY fe.created_at DESC
      LIMIT 1;

      -- Se encontrou um PAYOUT/VOID_REFUND ativo, reverter EXATAMENTE pelo valor do ledger
      IF v_old_event_id IS NOT NULL AND v_old_event_value IS NOT NULL AND v_old_event_value <> 0 THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, created_by,
          tipo_evento, tipo_uso, origem, valor, moeda,
          idempotency_key, descricao, reversed_event_id
        ) VALUES (
          v_bookmaker_id, v_surebet_id, p_workspace_id,
          (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
          'REVERSAL', v_old_event_tipo_uso, 'AJUSTE',
          -v_old_event_value, v_old_event_moeda,
          'reversal_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
          'Reversão payout perna (reliquidação)',
          v_old_event_id
        );
      END IF;
    END;
  END IF;

  -- ============================================================
  -- CALCULAR NOVO PAYOUT
  -- ============================================================
  IF p_resultado = 'GREEN' THEN
    v_payout := CASE WHEN v_is_freebet THEN v_stake_val * (v_odd_val - 1) ELSE v_stake_val * v_odd_val END;
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    v_payout := CASE WHEN v_is_freebet THEN (v_stake_val * (v_odd_val - 1)) / 2 ELSE (v_stake_val + v_stake_val * (v_odd_val - 1) / 2) END;
  ELSIF p_resultado = 'MEIO_RED' THEN
    v_payout := v_stake_val / 2;
  ELSIF p_resultado = 'VOID' THEN
    v_payout := v_stake_val;
  ELSE
    v_payout := 0;
  END IF;

  -- ============================================================
  -- INSERIR NOVO PAYOUT/VOID_REFUND
  -- ============================================================
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
      'void_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
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
      'PAYOUT', 'NORMAL', 'PAYOUT',
      v_payout, v_moeda,
      'payout_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
      format('Payout perna surebet (%s)%s', p_resultado, CASE WHEN v_is_freebet THEN ' [FB->REAL]' ELSE '' END)
    );
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
  -- RECALCULAR PAI
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

    -- Chamar fn_recalc_pai_surebet para atualizar pl_consolidado e demais campos
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
    'resultado_final_pai', CASE WHEN v_todas_liquidadas THEN v_resultado_final ELSE NULL END
  );
END;
$function$;
