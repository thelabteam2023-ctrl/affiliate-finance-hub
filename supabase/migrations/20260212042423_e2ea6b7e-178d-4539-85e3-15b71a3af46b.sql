
-- ============================================================================
-- CORREÇÃO: Idempotency Keys Determinísticas
--
-- BUG 1 (liquidar_perna_surebet_v1): payout key colide em ciclos G→R→G
-- BUG 2 (editar_perna_surebet_atomica): keys usam timestamp (não determinísticas)
--
-- FIX: Keys incluem transição completa (from_to) com contador monotônico
-- ============================================================================

-- ============================================================
-- FIX 1: liquidar_perna_surebet_v1 — payout key com transição
-- ============================================================
CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(
  p_surebet_id UUID,
  p_perna_id UUID,
  p_resultado TEXT,
  p_resultado_anterior TEXT DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL,
  p_fonte_saldo TEXT DEFAULT 'REAL'
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

  -- 2. GUARD: resultado não mudou
  v_res_anterior := COALESCE(p_resultado_anterior, v_perna.resultado, 'PENDENTE');
  IF v_res_anterior = COALESCE(p_resultado, 'PENDENTE') THEN
    RETURN jsonb_build_object(
      'success', true, 'message', 'Resultado não mudou',
      'events_created', 0, 'lucro_prejuizo', COALESCE(v_perna.lucro_prejuizo, 0), 'delta', 0
    );
  END IF;

  -- 3. CONTAR TRANSIÇÕES ANTERIORES (para idempotency key única por transição)
  SELECT COUNT(*) INTO v_transition_count
  FROM financial_events
  WHERE aposta_id = p_surebet_id
    AND idempotency_key LIKE 'liq_perna_' || p_perna_id || '_%';

  -- 4. CALCULAR LUCRO
  IF p_resultado IS NULL THEN v_lucro := NULL;
  ELSIF p_resultado = 'GREEN' THEN v_lucro := v_perna.stake * (v_perna.odd - 1);
  ELSIF p_resultado = 'MEIO_GREEN' THEN v_lucro := (v_perna.stake * (v_perna.odd - 1)) / 2;
  ELSIF p_resultado = 'RED' THEN v_lucro := -v_perna.stake;
  ELSIF p_resultado = 'MEIO_RED' THEN v_lucro := -v_perna.stake / 2;
  ELSIF p_resultado = 'VOID' THEN v_lucro := 0;
  END IF;

  -- 5. CALCULAR PAYOUT NOVO
  v_tipo_uso := CASE WHEN p_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END;

  IF p_resultado = 'GREEN' THEN
    v_payout := v_perna.stake * v_perna.odd;
    v_tipo_evento := CASE WHEN p_fonte_saldo = 'FREEBET' THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END;
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    v_payout := v_perna.stake + (v_perna.stake * (v_perna.odd - 1) / 2);
    v_tipo_evento := CASE WHEN p_fonte_saldo = 'FREEBET' THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END;
  ELSIF p_resultado = 'VOID' THEN
    v_payout := v_perna.stake;
    v_tipo_evento := 'VOID_REFUND';
  ELSIF p_resultado = 'MEIO_RED' THEN
    v_payout := v_perna.stake / 2;
    v_tipo_evento := 'VOID_REFUND';
  ELSE
    v_payout := 0; v_tipo_evento := NULL;
  END IF;

  -- 6. REVERTER PAYOUT ANTERIOR
  IF v_res_anterior IS NOT NULL AND v_res_anterior NOT IN ('PENDENTE') THEN
    IF v_res_anterior = 'GREEN' THEN
      v_payout_anterior := v_perna.stake * v_perna.odd;
    ELSIF v_res_anterior = 'MEIO_GREEN' THEN
      v_payout_anterior := v_perna.stake + (v_perna.stake * (v_perna.odd - 1) / 2);
    ELSIF v_res_anterior = 'VOID' THEN
      v_payout_anterior := v_perna.stake;
    ELSIF v_res_anterior = 'MEIO_RED' THEN
      v_payout_anterior := v_perna.stake / 2;
    END IF;

    IF v_payout_anterior > 0 THEN
      -- KEY DETERMINÍSTICA COM CONTADOR: única por transição
      v_reversal_key := 'liq_perna_' || p_perna_id || '_rev_' || v_res_anterior || '_to_' || COALESCE(p_resultado, 'NULL') || '_n' || v_transition_count;

      INSERT INTO financial_events (
        id, bookmaker_id, aposta_id, workspace_id, user_id,
        tipo_evento, tipo_uso, origem, valor, moeda,
        idempotency_key, descricao, processed_at
      ) VALUES (
        gen_random_uuid(), v_perna.bookmaker_id, p_surebet_id, p_workspace_id, v_user_id,
        'REVERSAL',
        CASE WHEN p_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
        'REVERSAL', -v_payout_anterior, v_perna.moeda,
        v_reversal_key,
        'Reversão perna ' || v_res_anterior || ' → ' || COALESCE(p_resultado, 'NULL'),
        now()
      );
      v_events_created := v_events_created + 1;
    END IF;
  END IF;

  -- 7. CRIAR EVENTO DE PAYOUT
  IF v_tipo_evento IS NOT NULL AND v_payout > 0 THEN
    -- KEY DETERMINÍSTICA COM CONTADOR: única por transição
    v_idempotency_key := 'liq_perna_' || p_perna_id || '_pay_' || COALESCE(p_resultado, 'NULL') || '_from_' || v_res_anterior || '_n' || v_transition_count;
    
    v_tipo_uso_evento := CASE WHEN v_tipo_evento LIKE 'FREEBET%' THEN 'NORMAL' ELSE v_tipo_uso END;

    INSERT INTO financial_events (
      id, bookmaker_id, aposta_id, workspace_id, user_id,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao, processed_at
    ) VALUES (
      gen_random_uuid(), v_perna.bookmaker_id, p_surebet_id, p_workspace_id, v_user_id,
      v_tipo_evento, v_tipo_uso_evento, 'LUCRO',
      v_payout, v_perna.moeda,
      v_idempotency_key,
      'Payout Surebet Perna: ' || p_resultado,
      now()
    );
    v_events_created := v_events_created + 1;
  END IF;

  -- 8. ATUALIZAR PERNA
  UPDATE apostas_pernas
  SET resultado = p_resultado, lucro_prejuizo = v_lucro, updated_at = now()
  WHERE id = p_perna_id;

  -- 9. RECALCULAR PAI
  SELECT 
    bool_and(resultado IS NOT NULL AND resultado != 'PENDENTE'),
    COALESCE(SUM(lucro_prejuizo), 0),
    COALESCE(SUM(stake), 0)
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total
  FROM apostas_pernas WHERE aposta_id = p_surebet_id;

  IF v_todas_liquidadas THEN
    v_resultado_final := CASE WHEN v_lucro_total > 0 THEN 'GREEN' WHEN v_lucro_total < 0 THEN 'RED' ELSE 'VOID' END;
  ELSE
    v_resultado_final := NULL;
  END IF;

  UPDATE apostas_unificada SET
    status = CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PENDENTE' END,
    resultado = v_resultado_final,
    lucro_prejuizo = CASE WHEN v_todas_liquidadas THEN v_lucro_total ELSE NULL END,
    roi_real = CASE WHEN v_todas_liquidadas AND v_stake_total > 0 THEN (v_lucro_total / v_stake_total) * 100 ELSE NULL END,
    updated_at = now()
  WHERE id = p_surebet_id;

  RETURN jsonb_build_object(
    'success', true, 'events_created', v_events_created,
    'lucro_prejuizo', COALESCE(v_lucro, 0), 'delta', v_payout,
    'payout_anterior_revertido', v_payout_anterior,
    'resultado_final_pai', v_resultado_final
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ============================================================
-- FIX 2: editar_perna_surebet_atomica — keys determinísticas
-- ============================================================
CREATE OR REPLACE FUNCTION public.editar_perna_surebet_atomica(
  p_perna_id UUID,
  p_new_stake NUMERIC DEFAULT NULL,
  p_new_odd NUMERIC DEFAULT NULL,
  p_new_bookmaker_id UUID DEFAULT NULL,
  p_new_selecao TEXT DEFAULT NULL,
  p_new_selecao_livre TEXT DEFAULT NULL
) RETURNS JSONB
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
BEGIN
  -- 1. Buscar perna
  SELECT ap.id, ap.aposta_id, ap.bookmaker_id, ap.stake, ap.odd, ap.moeda,
         ap.resultado, ap.fonte_saldo,
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
  v_eff_stake := COALESCE(p_new_stake, v_old_stake);
  v_eff_odd := COALESCE(p_new_odd, v_old_odd);
  v_resultado := v_perna.resultado;
  v_moeda := v_perna.moeda;
  v_user_id := v_perna.user_id;

  -- Contador de edições para idempotency key única
  SELECT COUNT(*) INTO v_edit_count
  FROM financial_events
  WHERE aposta_id = v_surebet_id
    AND idempotency_key LIKE 'edit_perna_' || p_perna_id || '_%';

  -- ============================================================
  -- A) BOOKMAKER CHANGE
  -- ============================================================
  IF p_new_bookmaker_id IS NOT NULL AND p_new_bookmaker_id != v_old_bk THEN
    -- A1. Reverse stake on old bookmaker (credit back)
    INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
    VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', v_old_stake, v_moeda,
            'edit_perna_' || p_perna_id || '_bk_rev_stake_n' || v_edit_count,
            format('Reversão stake (mudança bookmaker): %s', v_old_stake), now());
    
    -- A2. Create stake on new bookmaker (debit)
    INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
    VALUES (gen_random_uuid(), p_new_bookmaker_id, v_surebet_id, v_ws, v_user_id, 'STAKE', 'NORMAL', 'APOSTA', -v_eff_stake, v_moeda,
            'edit_perna_' || p_perna_id || '_bk_new_stake_n' || v_edit_count,
            format('Stake em novo bookmaker: %s', v_eff_stake), now());
    
    -- A3. If liquidated with payout, move payout
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
      
      IF v_old_payout > 0 THEN
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', -v_old_payout, v_moeda,
                'edit_perna_' || p_perna_id || '_bk_rev_payout_n' || v_edit_count,
                'Reversão payout (mudança bookmaker)', now());
      END IF;
      
      IF v_new_payout > 0 THEN
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), p_new_bookmaker_id, v_surebet_id, v_ws, v_user_id, 'PAYOUT', 'NORMAL', 'LUCRO', v_new_payout, v_moeda,
                'edit_perna_' || p_perna_id || '_bk_new_payout_n' || v_edit_count,
                'Payout em novo bookmaker', now());
      END IF;
    END IF;
  ELSE
    -- ============================================================
    -- B) SAME BOOKMAKER: AJUSTE events
    -- ============================================================
    
    -- B1. Stake change
    IF p_new_stake IS NOT NULL AND p_new_stake != v_old_stake THEN
      v_stake_diff := p_new_stake - v_old_stake;
      INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
      VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'AJUSTE', 'NORMAL', 'AJUSTE', -v_stake_diff, v_moeda,
              'edit_perna_' || p_perna_id || '_stake_' || v_old_stake || '_to_' || p_new_stake || '_n' || v_edit_count,
              format('Ajuste stake perna: %s → %s', v_old_stake, p_new_stake), now());
    END IF;
    
    -- B2. Payout change on liquidated perna
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
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'AJUSTE', 'NORMAL', 'AJUSTE', v_payout_diff, v_moeda,
                'edit_perna_' || p_perna_id || '_payout_' || v_old_odd || '_to_' || v_eff_odd || '_n' || v_edit_count,
                format('Ajuste payout (odd %s→%s): %s → %s', v_old_odd, v_eff_odd, v_old_payout, v_new_payout), now());
      END IF;
    END IF;
  END IF;
  
  -- C) UPDATE PERNA
  UPDATE apostas_pernas SET
    stake = v_eff_stake,
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
  
  -- D) RECALCULATE PARENT
  UPDATE apostas_unificada SET
    stake_total = (SELECT COALESCE(SUM(stake), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id),
    lucro_prejuizo = CASE
      WHEN (SELECT bool_and(resultado IS NOT NULL AND resultado != 'PENDENTE') FROM apostas_pernas WHERE aposta_id = v_surebet_id)
      THEN (SELECT COALESCE(SUM(lucro_prejuizo), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id)
      ELSE lucro_prejuizo
    END,
    roi_real = CASE
      WHEN (SELECT bool_and(resultado IS NOT NULL AND resultado != 'PENDENTE') FROM apostas_pernas WHERE aposta_id = v_surebet_id)
           AND (SELECT COALESCE(SUM(stake), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id) > 0
      THEN ((SELECT COALESCE(SUM(lucro_prejuizo), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id)::NUMERIC
            / (SELECT COALESCE(SUM(stake), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id)) * 100
      ELSE roi_real
    END,
    updated_at = now()
  WHERE id = v_surebet_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'old_stake', v_old_stake,
    'new_stake', v_eff_stake,
    'old_odd', v_old_odd,
    'new_odd', v_eff_odd
  );
END;
$$;
