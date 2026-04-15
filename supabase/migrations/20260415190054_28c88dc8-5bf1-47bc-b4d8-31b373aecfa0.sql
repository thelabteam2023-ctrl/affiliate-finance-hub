
-- Drop and recreate fn_recalc_pai_surebet to use cotacao_snapshot from pernas
-- and also return pl_consolidado + consolidation_currency

DROP FUNCTION IF EXISTS fn_recalc_pai_surebet(UUID);

CREATE OR REPLACE FUNCTION fn_recalc_pai_surebet(p_surebet_id UUID)
RETURNS TABLE(
  todas_liquidadas BOOLEAN,
  lucro_total NUMERIC,
  stake_total NUMERIC,
  resultado_final TEXT,
  is_multicurrency BOOLEAN,
  pl_consolidado NUMERIC,
  stake_consolidado NUMERIC,
  consolidation_currency TEXT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_moeda_consolidacao TEXT;
  v_perna RECORD;
  v_rate NUMERIC;
  v_todas_liquidadas BOOLEAN := true;
  v_lucro_total NUMERIC := 0;
  v_stake_total NUMERIC := 0;
  v_is_multicurrency BOOLEAN := false;
  -- For snapshot-based cross-rate calculation
  v_snapshot_brl_for_consol NUMERIC;
BEGIN
  -- Get project consolidation currency
  SELECT COALESCE(p.moeda_consolidacao, 'BRL') INTO v_moeda_consolidacao
  FROM projetos p
  JOIN apostas_unificada au ON au.projeto_id = p.id
  WHERE au.id = p_surebet_id;

  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  -- For non-BRL consolidation, we need a reference rate from pernas
  -- (e.g. for USD consolidation, find a USD perna's cotacao_snapshot as the BRL/USD rate)
  IF v_moeda_consolidacao != 'BRL' THEN
    SELECT ap.cotacao_snapshot INTO v_snapshot_brl_for_consol
    FROM apostas_pernas ap
    WHERE ap.aposta_id = p_surebet_id
      AND ap.moeda = v_moeda_consolidacao
      AND ap.cotacao_snapshot IS NOT NULL
      AND ap.cotacao_snapshot > 0
    LIMIT 1;

    -- Fallback to exchange_rate_cache if no snapshot available
    IF v_snapshot_brl_for_consol IS NULL THEN
      SELECT erc.rate INTO v_snapshot_brl_for_consol
      FROM exchange_rate_cache erc
      WHERE erc.currency_pair = v_moeda_consolidacao || 'BRL'
      LIMIT 1;
    END IF;
  END IF;

  FOR v_perna IN
    SELECT ap.moeda, ap.lucro_prejuizo, ap.stake, ap.resultado, ap.cotacao_snapshot, ap.stake_brl_referencia
    FROM apostas_pernas ap
    WHERE ap.aposta_id = p_surebet_id
  LOOP
    -- Check if all settled
    IF v_perna.resultado IS NULL OR v_perna.resultado = 'PENDENTE' THEN
      v_todas_liquidadas := false;
    END IF;

    -- Detect multi-currency
    IF v_perna.moeda != v_moeda_consolidacao THEN
      v_is_multicurrency := true;
    END IF;

    -- Calculate conversion rate using snapshot
    IF v_perna.moeda = v_moeda_consolidacao THEN
      v_rate := 1;
    ELSIF v_moeda_consolidacao = 'BRL' THEN
      -- Direct: use cotacao_snapshot (moeda→BRL)
      v_rate := COALESCE(v_perna.cotacao_snapshot, 1);
    ELSE
      -- Cross-rate via BRL: (moeda→BRL) / (consolidacao→BRL)
      -- Both from snapshots for consistency
      IF v_perna.cotacao_snapshot IS NOT NULL AND v_perna.cotacao_snapshot > 0
         AND v_snapshot_brl_for_consol IS NOT NULL AND v_snapshot_brl_for_consol > 0 THEN
        v_rate := v_perna.cotacao_snapshot / v_snapshot_brl_for_consol;
      ELSE
        -- Ultimate fallback: use stake_brl_referencia ratio
        IF v_perna.stake_brl_referencia IS NOT NULL AND v_perna.stake > 0
           AND v_snapshot_brl_for_consol IS NOT NULL AND v_snapshot_brl_for_consol > 0 THEN
          v_rate := (v_perna.stake_brl_referencia / v_perna.stake) / v_snapshot_brl_for_consol;
        ELSE
          v_rate := 1;
        END IF;
      END IF;
    END IF;

    v_lucro_total := v_lucro_total + COALESCE(v_perna.lucro_prejuizo, 0) * v_rate;
    v_stake_total := v_stake_total + COALESCE(v_perna.stake, 0) * v_rate;
  END LOOP;

  v_lucro_total := ROUND(v_lucro_total, 2);
  v_stake_total := ROUND(v_stake_total, 2);

  RETURN QUERY SELECT
    v_todas_liquidadas,
    v_lucro_total,
    v_stake_total,
    CASE 
      WHEN v_todas_liquidadas AND v_lucro_total > 0 THEN 'GREEN'
      WHEN v_todas_liquidadas AND v_lucro_total < 0 THEN 'RED'
      WHEN v_todas_liquidadas THEN 'VOID'
      ELSE NULL::TEXT
    END,
    v_is_multicurrency,
    v_lucro_total,   -- pl_consolidado = same as lucro_total (already in consolidation currency)
    v_stake_total,   -- stake_consolidado
    v_moeda_consolidacao;
END;
$$;

-- Update liquidar_perna_surebet_v1 to also set pl_consolidado and consolidation_currency
CREATE OR REPLACE FUNCTION liquidar_perna_surebet_v1(
  p_surebet_id UUID,
  p_perna_id UUID,
  p_resultado TEXT,
  p_resultado_anterior TEXT DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL,
  p_fonte_saldo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perna RECORD;
  v_surebet RECORD;
  v_payout NUMERIC(15,2) := 0;
  v_tipo_evento TEXT;
  v_payout_anterior NUMERIC(15,2) := 0;
  v_lucro NUMERIC(15,2) := 0;
  v_tipo_uso TEXT;
  v_tipo_uso_evento TEXT;
  v_idempotency_key TEXT;
  v_reversal_key TEXT;
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC(15,2);
  v_stake_total NUMERIC(15,2);
  v_resultado_final TEXT;
  v_events_created INT := 0;
  v_user_id UUID;
  v_res_anterior TEXT;
  v_transition_count INT;
  v_is_freebet BOOLEAN;
  v_is_multicurrency BOOLEAN;
  v_pl_consolidado NUMERIC(15,2);
  v_stake_consolidado NUMERIC(15,2);
  v_consolidation_currency TEXT;
BEGIN
  -- 1. BUSCAR DADOS
  SELECT ap.*, b.workspace_id AS bk_workspace_id
  INTO v_perna
  FROM apostas_pernas ap
  JOIN bookmakers b ON b.id = ap.bookmaker_id
  WHERE ap.id = p_perna_id AND ap.aposta_id = p_surebet_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;

  SELECT au.user_id, au.status, au.forma_registro
  INTO v_surebet
  FROM apostas_unificada au
  WHERE au.id = p_surebet_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Surebet não encontrada');
  END IF;

  v_user_id := v_surebet.user_id;
  IF p_workspace_id IS NULL THEN
    p_workspace_id := v_perna.bk_workspace_id;
  END IF;

  v_is_freebet := COALESCE(v_perna.fonte_saldo, p_fonte_saldo, 'REAL') = 'FREEBET';

  -- 2. GUARD: resultado não mudou
  v_res_anterior := COALESCE(p_resultado_anterior, v_perna.resultado, 'PENDENTE');
  IF v_res_anterior = COALESCE(p_resultado, 'PENDENTE') THEN
    RETURN jsonb_build_object(
      'success', true, 'message', 'Resultado não mudou',
      'events_created', 0, 'lucro_prejuizo', COALESCE(v_perna.lucro_prejuizo, 0), 'delta', 0
    );
  END IF;

  -- 3. CONTAR TRANSIÇÕES ANTERIORES
  SELECT COUNT(*) INTO v_transition_count
  FROM financial_events
  WHERE aposta_id = p_surebet_id
    AND idempotency_key LIKE 'liq_perna_' || p_perna_id || '_%';

  -- 4. CALCULAR LUCRO (SNR para FREEBET)
  IF p_resultado IS NULL THEN 
    v_lucro := NULL;
  ELSIF p_resultado = 'GREEN' THEN 
    v_lucro := v_perna.stake * (v_perna.odd - 1);
  ELSIF p_resultado = 'MEIO_GREEN' THEN 
    v_lucro := (v_perna.stake * (v_perna.odd - 1)) / 2;
  ELSIF p_resultado = 'RED' THEN 
    v_lucro := CASE WHEN v_is_freebet THEN 0 ELSE -v_perna.stake END;
  ELSIF p_resultado = 'MEIO_RED' THEN 
    v_lucro := CASE WHEN v_is_freebet THEN 0 ELSE -v_perna.stake / 2 END;
  ELSIF p_resultado = 'VOID' THEN 
    v_lucro := 0;
  END IF;

  -- 5. CALCULAR PAYOUT NOVO (SNR para FREEBET)
  v_tipo_uso := CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END;

  IF p_resultado = 'GREEN' THEN
    IF v_is_freebet THEN
      v_payout := v_perna.stake * (v_perna.odd - 1);
      v_tipo_evento := 'FREEBET_PAYOUT';
    ELSE
      v_payout := v_perna.stake * v_perna.odd;
      v_tipo_evento := 'PAYOUT';
    END IF;
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    IF v_is_freebet THEN
      v_payout := (v_perna.stake * (v_perna.odd - 1)) / 2;
      v_tipo_evento := 'FREEBET_PAYOUT';
    ELSE
      v_payout := v_perna.stake + (v_perna.stake * (v_perna.odd - 1) / 2);
      v_tipo_evento := 'PAYOUT';
    END IF;
  ELSIF p_resultado = 'VOID' THEN
    v_payout := v_perna.stake;
    v_tipo_evento := 'VOID_REFUND';
  ELSIF p_resultado = 'MEIO_RED' THEN
    IF v_is_freebet THEN
      v_payout := 0;
      v_tipo_evento := NULL;
    ELSE
      v_payout := v_perna.stake / 2;
      v_tipo_evento := 'VOID_REFUND';
    END IF;
  ELSE
    v_payout := 0; 
    v_tipo_evento := NULL;
  END IF;

  -- 6. REVERTER PAYOUT ANTERIOR
  IF v_res_anterior IS NOT NULL AND v_res_anterior NOT IN ('PENDENTE') THEN
    IF v_res_anterior = 'GREEN' THEN
      v_payout_anterior := CASE WHEN v_is_freebet 
        THEN v_perna.stake * (v_perna.odd - 1) 
        ELSE v_perna.stake * v_perna.odd END;
    ELSIF v_res_anterior = 'MEIO_GREEN' THEN
      v_payout_anterior := CASE WHEN v_is_freebet 
        THEN (v_perna.stake * (v_perna.odd - 1)) / 2 
        ELSE v_perna.stake + (v_perna.stake * (v_perna.odd - 1) / 2) END;
    ELSIF v_res_anterior = 'VOID' THEN
      v_payout_anterior := v_perna.stake;
    ELSIF v_res_anterior = 'MEIO_RED' THEN
      v_payout_anterior := CASE WHEN v_is_freebet THEN 0 ELSE v_perna.stake / 2 END;
    END IF;

    IF v_payout_anterior > 0 THEN
      DECLARE
        v_reversal_tipo_uso TEXT;
      BEGIN
        IF v_is_freebet AND v_res_anterior = 'VOID' THEN
          v_reversal_tipo_uso := 'FREEBET';
        ELSIF v_is_freebet AND v_res_anterior IN ('GREEN', 'MEIO_GREEN') THEN
          v_reversal_tipo_uso := 'NORMAL';
        ELSE
          v_reversal_tipo_uso := CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END;
        END IF;

        v_reversal_key := 'liq_perna_' || p_perna_id || '_rev_' || v_res_anterior || '_to_' || COALESCE(p_resultado, 'NULL') || '_n' || v_transition_count;

        INSERT INTO financial_events (
          id, bookmaker_id, aposta_id, workspace_id, created_by,
          tipo_evento, tipo_uso, origem, valor, moeda,
          idempotency_key, descricao, processed_at
        ) VALUES (
          gen_random_uuid(), v_perna.bookmaker_id, p_surebet_id, p_workspace_id, v_user_id,
          'REVERSAL', v_reversal_tipo_uso, 'REVERSAL', -v_payout_anterior, v_perna.moeda,
          v_reversal_key,
          'Reversão perna ' || v_res_anterior || ' → ' || COALESCE(p_resultado, 'NULL'),
          now()
        );
        v_events_created := v_events_created + 1;
      END;
    END IF;
  END IF;

  -- 7. CRIAR EVENTO DE PAYOUT
  IF v_tipo_evento IS NOT NULL AND v_payout > 0 THEN
    v_idempotency_key := 'liq_perna_' || p_perna_id || '_pay_' || COALESCE(p_resultado, 'NULL') || '_from_' || v_res_anterior || '_n' || v_transition_count;
    
    IF v_tipo_evento = 'FREEBET_PAYOUT' THEN
      v_tipo_uso_evento := 'NORMAL';
    ELSIF v_tipo_evento = 'VOID_REFUND' AND v_is_freebet THEN
      v_tipo_uso_evento := 'FREEBET';
    ELSE
      v_tipo_uso_evento := 'NORMAL';
    END IF;

    INSERT INTO financial_events (
      id, bookmaker_id, aposta_id, workspace_id, created_by,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao, processed_at
    ) VALUES (
      gen_random_uuid(), v_perna.bookmaker_id, p_surebet_id, p_workspace_id, v_user_id,
      v_tipo_evento, v_tipo_uso_evento, 'LUCRO',
      v_payout, v_perna.moeda,
      v_idempotency_key,
      'Payout Surebet Perna: ' || p_resultado || CASE WHEN v_is_freebet THEN ' (FB/SNR)' ELSE '' END,
      now()
    );
    v_events_created := v_events_created + 1;
  END IF;

  -- 8. ATUALIZAR PERNA
  UPDATE apostas_pernas
  SET resultado = p_resultado, lucro_prejuizo = v_lucro, updated_at = now()
  WHERE id = p_perna_id;

  -- 9. RECALCULAR PAI (COM CONVERSÃO MULTIMOEDA VIA SNAPSHOT)
  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_final, 
         r.is_multicurrency, r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, 
       v_is_multicurrency, v_pl_consolidado, v_stake_consolidado, v_consolidation_currency
  FROM fn_recalc_pai_surebet(p_surebet_id) r;

  UPDATE apostas_unificada SET
    status = CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PENDENTE' END,
    resultado = v_resultado_final,
    lucro_prejuizo = CASE WHEN v_todas_liquidadas THEN v_lucro_total ELSE NULL END,
    is_multicurrency = v_is_multicurrency,
    pl_consolidado = CASE WHEN v_todas_liquidadas THEN v_pl_consolidado ELSE NULL END,
    stake_consolidado = v_stake_consolidado,
    consolidation_currency = v_consolidation_currency,
    roi_real = CASE WHEN v_todas_liquidadas AND v_stake_total > 0 THEN (v_lucro_total / v_stake_total) * 100 ELSE NULL END,
    updated_at = now()
  WHERE id = p_surebet_id;

  RETURN jsonb_build_object(
    'success', true, 'events_created', v_events_created,
    'lucro_prejuizo', COALESCE(v_lucro, 0), 'delta', v_payout,
    'payout_anterior_revertido', v_payout_anterior,
    'resultado_final_pai', v_resultado_final,
    'is_multicurrency', v_is_multicurrency,
    'pl_consolidado', v_pl_consolidado,
    'consolidation_currency', v_consolidation_currency
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Fix the Flamengo x Palmeiras record with correct snapshot-based values
-- Pernas: USD(-100, snapshot 4.9806), EUR(+169.62, snapshot 5.8726), USD(-100, snapshot 4.9806)
-- Consolidation: USD. Cross-rate EUR→USD = 5.8726/4.9806 = 1.1791
-- lucro = -100 + 169.62*1.1791 - 100 = -100 + 200.01 - 100 = 0.01
UPDATE apostas_unificada
SET lucro_prejuizo = 0.01,
    pl_consolidado = 0.01,
    stake_consolidado = 300.01,
    consolidation_currency = 'USD',
    resultado = 'GREEN',
    is_multicurrency = true,
    roi_real = CASE WHEN 300.01 > 0 THEN (0.01 / 300.01) * 100 ELSE NULL END,
    updated_at = now()
WHERE id = '89de227a-9276-42fa-bb64-6128c5bfee89';
