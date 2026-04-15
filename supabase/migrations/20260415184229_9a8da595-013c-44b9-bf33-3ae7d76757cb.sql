
-- ============================================================
-- Helper function: recalcular_pai_surebet_multimoeda
-- Converts each leg's lucro_prejuizo to the project's 
-- moeda_consolidacao before summing, fixing the multi-currency bug.
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalcular_pai_surebet_multimoeda(
  p_surebet_id UUID
) RETURNS RECORD
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moeda_consolidacao TEXT;
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC(15,5) := 0;
  v_stake_total NUMERIC(15,5) := 0;
  v_resultado_final TEXT;
  v_is_multicurrency BOOLEAN := false;
  v_perna RECORD;
  v_rate NUMERIC;
  v_lucro_convertido NUMERIC;
  v_stake_convertido NUMERIC;
  v_result RECORD;
BEGIN
  -- 1. Get project consolidation currency
  SELECT p.moeda_consolidacao INTO v_moeda_consolidacao
  FROM projetos p
  JOIN apostas_unificada au ON au.projeto_id = p.id
  WHERE au.id = p_surebet_id;

  -- Fallback to BRL if not set
  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  -- 2. Check if all legs are settled + detect multi-currency
  SELECT bool_and(resultado IS NOT NULL AND resultado != 'PENDENTE')
  INTO v_todas_liquidadas
  FROM apostas_pernas WHERE aposta_id = p_surebet_id;

  -- 3. Sum with currency conversion
  FOR v_perna IN
    SELECT ap.moeda, ap.lucro_prejuizo, ap.stake
    FROM apostas_pernas ap
    WHERE ap.aposta_id = p_surebet_id
  LOOP
    -- Detect multi-currency
    IF v_perna.moeda != v_moeda_consolidacao THEN
      v_is_multicurrency := true;
    END IF;

    -- Get conversion rate
    IF v_perna.moeda = v_moeda_consolidacao THEN
      v_rate := 1;
    ELSE
      -- Try direct pair: e.g., USD→BRL = rate from USDBRL
      SELECT erc.rate INTO v_rate
      FROM exchange_rate_cache erc
      WHERE erc.currency_pair = v_perna.moeda || v_moeda_consolidacao
      LIMIT 1;

      -- Try inverse pair: e.g., BRL→USD = 1/rate from USDBRL
      IF v_rate IS NULL THEN
        SELECT 1.0 / erc.rate INTO v_rate
        FROM exchange_rate_cache erc
        WHERE erc.currency_pair = v_moeda_consolidacao || v_perna.moeda
          AND erc.rate > 0
        LIMIT 1;
      END IF;

      -- Fallback: try cross via BRL
      IF v_rate IS NULL AND v_moeda_consolidacao != 'BRL' THEN
        DECLARE
          v_to_brl NUMERIC;
          v_consol_to_brl NUMERIC;
        BEGIN
          SELECT erc.rate INTO v_to_brl
          FROM exchange_rate_cache erc
          WHERE erc.currency_pair = v_perna.moeda || 'BRL'
          LIMIT 1;

          SELECT erc.rate INTO v_consol_to_brl
          FROM exchange_rate_cache erc
          WHERE erc.currency_pair = v_moeda_consolidacao || 'BRL'
          LIMIT 1;

          IF v_to_brl IS NOT NULL AND v_consol_to_brl IS NOT NULL AND v_consol_to_brl > 0 THEN
            v_rate := v_to_brl / v_consol_to_brl;
          END IF;
        END;
      END IF;

      -- Ultimate fallback
      IF v_rate IS NULL THEN v_rate := 1; END IF;
    END IF;

    v_lucro_convertido := COALESCE(v_perna.lucro_prejuizo, 0) * v_rate;
    v_stake_convertido := COALESCE(v_perna.stake, 0) * v_rate;

    v_lucro_total := v_lucro_total + v_lucro_convertido;
    v_stake_total := v_stake_total + v_stake_convertido;
  END LOOP;

  -- Round to 2 decimals
  v_lucro_total := ROUND(v_lucro_total, 2);
  v_stake_total := ROUND(v_stake_total, 2);

  -- 4. Determine final result
  IF v_todas_liquidadas THEN
    v_resultado_final := CASE 
      WHEN v_lucro_total > 0 THEN 'GREEN' 
      WHEN v_lucro_total < 0 THEN 'RED' 
      ELSE 'VOID' 
    END;
  ELSE
    v_resultado_final := NULL;
  END IF;

  SELECT v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- Wrapper function that returns a table (easier to call from other RPCs)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_recalc_pai_surebet(
  p_surebet_id UUID,
  OUT todas_liquidadas BOOLEAN,
  OUT lucro_total NUMERIC,
  OUT stake_total NUMERIC,
  OUT resultado_final TEXT,
  OUT is_multicurrency BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moeda_consolidacao TEXT;
  v_perna RECORD;
  v_rate NUMERIC;
BEGIN
  -- defaults
  todas_liquidadas := true;
  lucro_total := 0;
  stake_total := 0;
  is_multicurrency := false;

  -- Get project consolidation currency
  SELECT COALESCE(p.moeda_consolidacao, 'BRL') INTO v_moeda_consolidacao
  FROM projetos p
  JOIN apostas_unificada au ON au.projeto_id = p.id
  WHERE au.id = p_surebet_id;

  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  FOR v_perna IN
    SELECT ap.moeda, ap.lucro_prejuizo, ap.stake, ap.resultado
    FROM apostas_pernas ap
    WHERE ap.aposta_id = p_surebet_id
  LOOP
    -- Check if all settled
    IF v_perna.resultado IS NULL OR v_perna.resultado = 'PENDENTE' THEN
      todas_liquidadas := false;
    END IF;

    -- Detect multi-currency
    IF v_perna.moeda != v_moeda_consolidacao THEN
      is_multicurrency := true;
    END IF;

    -- Get conversion rate
    IF v_perna.moeda = v_moeda_consolidacao THEN
      v_rate := 1;
    ELSE
      SELECT erc.rate INTO v_rate
      FROM exchange_rate_cache erc
      WHERE erc.currency_pair = v_perna.moeda || v_moeda_consolidacao
      LIMIT 1;

      IF v_rate IS NULL THEN
        SELECT 1.0 / erc.rate INTO v_rate
        FROM exchange_rate_cache erc
        WHERE erc.currency_pair = v_moeda_consolidacao || v_perna.moeda
          AND erc.rate > 0
        LIMIT 1;
      END IF;

      IF v_rate IS NULL AND v_moeda_consolidacao != 'BRL' THEN
        DECLARE
          v_to_brl NUMERIC;
          v_consol_to_brl NUMERIC;
        BEGIN
          SELECT erc.rate INTO v_to_brl
          FROM exchange_rate_cache erc WHERE erc.currency_pair = v_perna.moeda || 'BRL' LIMIT 1;
          SELECT erc.rate INTO v_consol_to_brl
          FROM exchange_rate_cache erc WHERE erc.currency_pair = v_moeda_consolidacao || 'BRL' LIMIT 1;
          IF v_to_brl IS NOT NULL AND v_consol_to_brl IS NOT NULL AND v_consol_to_brl > 0 THEN
            v_rate := v_to_brl / v_consol_to_brl;
          END IF;
        END;
      END IF;

      IF v_rate IS NULL THEN v_rate := 1; END IF;
    END IF;

    lucro_total := lucro_total + COALESCE(v_perna.lucro_prejuizo, 0) * v_rate;
    stake_total := stake_total + COALESCE(v_perna.stake, 0) * v_rate;
  END LOOP;

  lucro_total := ROUND(lucro_total, 2);
  stake_total := ROUND(stake_total, 2);

  IF todas_liquidadas THEN
    resultado_final := CASE WHEN lucro_total > 0 THEN 'GREEN' WHEN lucro_total < 0 THEN 'RED' ELSE 'VOID' END;
  ELSE
    resultado_final := NULL;
  END IF;
END;
$$;

-- ============================================================
-- UPDATE liquidar_perna_surebet_v1: use helper for parent recalc
-- ============================================================
CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(
  p_surebet_id UUID,
  p_perna_id UUID,
  p_resultado TEXT DEFAULT NULL,
  p_resultado_anterior TEXT DEFAULT NULL,
  p_fonte_saldo TEXT DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL
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

  -- 9. RECALCULAR PAI (COM CONVERSÃO MULTIMOEDA)
  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_final, r.is_multicurrency
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency
  FROM fn_recalc_pai_surebet(p_surebet_id) r;

  UPDATE apostas_unificada SET
    status = CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PENDENTE' END,
    resultado = v_resultado_final,
    lucro_prejuizo = CASE WHEN v_todas_liquidadas THEN v_lucro_total ELSE NULL END,
    is_multicurrency = v_is_multicurrency,
    roi_real = CASE WHEN v_todas_liquidadas AND v_stake_total > 0 THEN (v_lucro_total / v_stake_total) * 100 ELSE NULL END,
    updated_at = now()
  WHERE id = p_surebet_id;

  RETURN jsonb_build_object(
    'success', true, 'events_created', v_events_created,
    'lucro_prejuizo', COALESCE(v_lucro, 0), 'delta', v_payout,
    'payout_anterior_revertido', v_payout_anterior,
    'resultado_final_pai', v_resultado_final,
    'is_multicurrency', v_is_multicurrency
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- UPDATE deletar_perna_surebet_v1: use helper for parent recalc
-- ============================================================
CREATE OR REPLACE FUNCTION public.deletar_perna_surebet_v1(
  p_perna_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  -- REVERSAL da stake
  INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
  VALUES (gen_random_uuid(), v_bk_id, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', v_stake, v_moeda,
          'del_perna_' || p_perna_id || '_rev_stake_n' || v_del_count,
          format('Reversão stake (delete perna): %s', v_stake), now());
  
  -- Se liquidada com payout, reverter
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
  
  -- Deletar perna
  DELETE FROM apostas_pernas WHERE id = p_perna_id;
  
  -- Contar restantes
  SELECT COUNT(*) INTO v_remaining_legs
  FROM apostas_pernas WHERE aposta_id = v_surebet_id;
  
  -- Recalcular parent com conversão multimoeda
  IF v_remaining_legs = 0 THEN
    UPDATE apostas_unificada SET
      status = 'CANCELADA', stake_total = 0, lucro_prejuizo = 0, roi_real = 0, updated_at = now()
    WHERE id = v_surebet_id;
  ELSE
    SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_final, r.is_multicurrency
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
$$;

-- ============================================================
-- UPDATE editar_perna_surebet_atomica: use helper for parent recalc
-- ============================================================
CREATE OR REPLACE FUNCTION public.editar_perna_surebet_atomica(
  p_perna_id UUID,
  p_new_stake NUMERIC DEFAULT NULL,
  p_new_odd NUMERIC DEFAULT NULL,
  p_new_bookmaker_id UUID DEFAULT NULL,
  p_new_selecao TEXT DEFAULT NULL,
  p_new_selecao_livre TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- For parent recalc
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

  -- Calcular novo stake_real e stake_freebet proporcionalmente
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

  -- VALIDAÇÃO DE SALDO
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

  -- A) BOOKMAKER CHANGE
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
    -- B) STAKE/ODD CHANGE (same bookmaker)
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

  -- C) UPDATE PERNA
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
  
  -- D) RECALCULATE PARENT (COM CONVERSÃO MULTIMOEDA)
  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_final, r.is_multicurrency
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
$$;
