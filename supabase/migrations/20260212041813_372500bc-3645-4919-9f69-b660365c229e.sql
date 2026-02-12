
-- ============================================================================
-- RPC: liquidar_perna_surebet_v1
-- 
-- Encapsula TODA a lógica financeira de liquidação de perna de Surebet.
-- Segue exatamente o mesmo padrão das RPCs de aposta simples:
--   1. Validações atômicas
--   2. INSERT em financial_events (ÚNICO ponto de movimentação)
--   3. Trigger fn_financial_events_sync_balance cuida do saldo
--   4. Update na perna e recálculo do pai
--
-- IDEMPOTÊNCIA: Chaves determinísticas impedem duplicação.
-- ATOMICIDADE: Tudo roda numa transação SQL.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(
  p_surebet_id UUID,
  p_perna_id UUID,
  p_resultado TEXT,            -- GREEN, RED, VOID, MEIO_GREEN, MEIO_RED, ou NULL (limpar)
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
  v_todas_pernas RECORD;
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC(15,2);
  v_stake_total NUMERIC(15,2);
  v_resultado_final TEXT;
  v_events_created INT := 0;
  v_user_id UUID;
BEGIN
  -- ============================================================
  -- 1. BUSCAR DADOS DA PERNA E SUREBET
  -- ============================================================
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

  -- Usar workspace_id do parâmetro ou da bookmaker
  IF p_workspace_id IS NULL THEN
    p_workspace_id := v_perna.bk_workspace_id;
  END IF;

  -- ============================================================
  -- 2. GUARD: Se resultado não mudou, retornar sem ação
  -- ============================================================
  IF COALESCE(p_resultado_anterior, v_perna.resultado, 'PENDENTE') = COALESCE(p_resultado, 'PENDENTE') THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Resultado não mudou, sem ação',
      'events_created', 0,
      'lucro_prejuizo', COALESCE(v_perna.lucro_prejuizo, 0),
      'delta', 0
    );
  END IF;

  -- ============================================================
  -- 3. CALCULAR LUCRO/PREJUÍZO
  -- ============================================================
  IF p_resultado IS NULL THEN
    v_lucro := NULL;
  ELSIF p_resultado = 'GREEN' THEN
    v_lucro := v_perna.stake * (v_perna.odd - 1);
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    v_lucro := (v_perna.stake * (v_perna.odd - 1)) / 2;
  ELSIF p_resultado = 'RED' THEN
    v_lucro := -v_perna.stake;
  ELSIF p_resultado = 'MEIO_RED' THEN
    v_lucro := -v_perna.stake / 2;
  ELSIF p_resultado = 'VOID' THEN
    v_lucro := 0;
  END IF;

  -- ============================================================
  -- 4. CALCULAR PAYOUT NOVO
  -- ============================================================
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
    -- RED ou NULL: sem payout
    v_payout := 0;
    v_tipo_evento := NULL;
  END IF;

  -- ============================================================
  -- 5. REVERTER PAYOUT ANTERIOR (se re-liquidação)
  -- ============================================================
  DECLARE
    v_res_anterior TEXT := COALESCE(p_resultado_anterior, v_perna.resultado);
  BEGIN
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
        v_reversal_key := 'reversal_perna_' || p_perna_id || '_' || v_res_anterior || '_to_' || COALESCE(p_resultado, 'NULL');

        -- Verificar idempotência
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_reversal_key) THEN
          INSERT INTO financial_events (
            id, bookmaker_id, aposta_id, workspace_id, user_id,
            tipo_evento, tipo_uso, origem, valor, moeda,
            idempotency_key, descricao, processed_at
          ) VALUES (
            gen_random_uuid(), v_perna.bookmaker_id, p_surebet_id, p_workspace_id, v_user_id,
            'REVERSAL',
            CASE WHEN p_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
            'REVERSAL',
            -v_payout_anterior,  -- NEGATIVO (reverte crédito anterior)
            v_perna.moeda,
            v_reversal_key,
            'Reversão perna ' || v_res_anterior || ' → ' || COALESCE(p_resultado, 'NULL'),
            now()
          );
          v_events_created := v_events_created + 1;
        END IF;
      END IF;
    END IF;
  END;

  -- ============================================================
  -- 6. CRIAR EVENTO DE PAYOUT (se aplicável)
  -- ============================================================
  IF v_tipo_evento IS NOT NULL AND v_payout > 0 THEN
    v_idempotency_key := 'payout_perna_' || p_perna_id || '_' || p_resultado;
    
    -- Para FREEBET_PAYOUT, tipo_uso deve ser NORMAL (lucro vai para saldo_atual)
    v_tipo_uso_evento := CASE WHEN v_tipo_evento LIKE 'FREEBET%' THEN 'NORMAL' ELSE v_tipo_uso END;

    -- Verificar idempotência
    IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
      INSERT INTO financial_events (
        id, bookmaker_id, aposta_id, workspace_id, user_id,
        tipo_evento, tipo_uso, origem, valor, moeda,
        idempotency_key, descricao, processed_at
      ) VALUES (
        gen_random_uuid(), v_perna.bookmaker_id, p_surebet_id, p_workspace_id, v_user_id,
        v_tipo_evento,
        v_tipo_uso_evento,
        'LUCRO',
        v_payout,  -- POSITIVO (crédito) — convenção v9.4
        v_perna.moeda,
        v_idempotency_key,
        'Payout Surebet Perna: ' || p_resultado,
        now()
      );
      v_events_created := v_events_created + 1;
    END IF;
  END IF;

  -- ============================================================
  -- 7. ATUALIZAR RESULTADO NA TABELA apostas_pernas
  -- ============================================================
  UPDATE apostas_pernas
  SET resultado = p_resultado,
      lucro_prejuizo = v_lucro,
      updated_at = now()
  WHERE id = p_perna_id;

  -- ============================================================
  -- 8. RECALCULAR STATUS DO REGISTRO PAI
  -- ============================================================
  SELECT 
    bool_and(resultado IS NOT NULL AND resultado != 'PENDENTE') AS todas_liquidadas,
    COALESCE(SUM(lucro_prejuizo), 0) AS lucro_total,
    COALESCE(SUM(stake), 0) AS stake_total
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total
  FROM apostas_pernas
  WHERE aposta_id = p_surebet_id;

  IF v_todas_liquidadas THEN
    v_resultado_final := CASE 
      WHEN v_lucro_total > 0 THEN 'GREEN'
      WHEN v_lucro_total < 0 THEN 'RED'
      ELSE 'VOID'
    END;
  ELSE
    v_resultado_final := NULL;
  END IF;

  UPDATE apostas_unificada
  SET status = CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PENDENTE' END,
      resultado = v_resultado_final,
      lucro_prejuizo = CASE WHEN v_todas_liquidadas THEN v_lucro_total ELSE NULL END,
      roi_real = CASE WHEN v_todas_liquidadas AND v_stake_total > 0 THEN (v_lucro_total / v_stake_total) * 100 ELSE NULL END,
      updated_at = now()
  WHERE id = p_surebet_id;

  -- ============================================================
  -- 9. RETORNO
  -- ============================================================
  RETURN jsonb_build_object(
    'success', true,
    'events_created', v_events_created,
    'lucro_prejuizo', COALESCE(v_lucro, 0),
    'delta', v_payout,
    'payout_anterior_revertido', v_payout_anterior,
    'resultado_final_pai', v_resultado_final
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
