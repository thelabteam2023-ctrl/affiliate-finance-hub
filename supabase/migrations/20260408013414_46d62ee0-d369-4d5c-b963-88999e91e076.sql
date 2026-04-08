
-- ============================================================================
-- FIX: liquidar_perna_surebet_v1 — Priorizar fonte_saldo ARMAZENADA na perna
-- 
-- BUG: O parâmetro p_fonte_saldo com default 'REAL' sobrescreve o valor correto
-- armazenado em apostas_pernas.fonte_saldo, fazendo freebet RED ser tratada como
-- perda real (-stake) em vez de 0.
-- 
-- FIX: Inverter prioridade do COALESCE para usar o valor persistido primeiro.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(
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

  -- ================================================================
  -- FIX CRÍTICO: Priorizar fonte_saldo ARMAZENADA na perna (verdade do banco)
  -- Antes: COALESCE(p_fonte_saldo, v_perna.fonte_saldo, 'REAL') → default 'REAL' sobrescrevia
  -- Agora: COALESCE(v_perna.fonte_saldo, p_fonte_saldo, 'REAL') → perna tem prioridade
  -- ================================================================
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

  -- ================================================================
  -- 4. CALCULAR LUCRO (SNR para FREEBET)
  -- FREEBET: stake não tem custo real → RED/MEIO_RED = 0 de prejuízo
  -- ================================================================
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

  -- ================================================================
  -- 5. CALCULAR PAYOUT NOVO (SNR para FREEBET)
  -- FREEBET GREEN: retorna apenas lucro = stake*(odd-1), NÃO a stake
  -- FREEBET VOID: devolve freebet ao saldo_freebet
  -- FREEBET RED: nada a devolver
  -- ================================================================
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

  -- ================================================================
  -- 6. REVERTER PAYOUT ANTERIOR (com SNR corrigido)
  -- ================================================================
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

  -- ================================================================
  -- 7. CRIAR EVENTO DE PAYOUT
  -- ================================================================
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

-- Grants
GRANT EXECUTE ON FUNCTION public.liquidar_perna_surebet_v1(UUID, UUID, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.liquidar_perna_surebet_v1(UUID, UUID, TEXT, TEXT, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.liquidar_perna_surebet_v1 IS 
'v10.1 - FIX: Prioriza fonte_saldo armazenada na perna sobre parâmetro (corrige freebet RED tratada como perda real)';
