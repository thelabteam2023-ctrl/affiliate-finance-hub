-- =====================================================
-- FIX: reliquidar_aposta_v6 self-healing para multi-entry sem ledger
-- =====================================================
-- Garante que, se uma aposta multi-entry já estiver LIQUIDADA mas SEM
-- eventos financeiros (criados antes do fix do ApostaService), os
-- eventos STAKE + PAYOUT/VOID_REFUND base sejam criados antes do AJUSTE.
-- Após o backfill, a diferença é zero (já está tudo correto) — a função
-- só insere AJUSTE delta se houver mudança real de resultado.

CREATE OR REPLACE FUNCTION public.reliquidar_aposta_v6(
  p_aposta_id uuid,
  p_novo_resultado text,
  p_lucro_prejuizo numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_resultado_anterior TEXT;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_novo_lucro NUMERIC := 0;
  v_bookmaker_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
  v_is_freebet BOOLEAN;
  v_tipo_uso TEXT;
  v_impacto_anterior NUMERIC;
  v_impacto_novo NUMERIC;
  v_diferenca NUMERIC;
  v_idempotency_key TEXT;
  v_moeda TEXT;
  v_evento_existente UUID;
  v_has_pernas BOOLEAN := FALSE;
  v_perna_count INTEGER := 0;
  v_total_diferenca NUMERIC := 0;
  v_stake_real NUMERIC;
  v_stake_freebet NUMERIC;
  v_stake_event_exists BOOLEAN;
  v_payout_event_exists BOOLEAN;
  v_perna_payout NUMERIC;
  v_perna_tipo_evento TEXT;
  v_perna_stake_evento TEXT;
  v_perna_tipo_uso TEXT;
  v_is_freebet_perna BOOLEAN;
BEGIN
  SELECT 
    au.id, au.resultado, au.lucro_prejuizo, au.stake,
    au.odd, au.odd_final, au.bookmaker_id, au.workspace_id, au.user_id,
    COALESCE(au.usar_freebet, FALSE) as usar_freebet,
    COALESCE(au.fonte_saldo, 'REAL') as fonte_saldo,
    COALESCE(au.moeda_operacao, 'BRL') as moeda
  INTO v_aposta
  FROM apostas_unificada au
  WHERE au.id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;
  
  v_resultado_anterior := v_aposta.resultado;

  -- Detectar multi-entry
  SELECT COUNT(*) INTO v_perna_count FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  v_has_pernas := v_perna_count > 0;

  IF v_has_pernas THEN
    -- ============== MULTI-ENTRY PATH ==============
    FOR v_perna IN
      SELECT * FROM apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
    LOOP
      v_odd := COALESCE(v_perna.odd, 1);
      v_stake := COALESCE(v_perna.stake, 0);
      v_stake_freebet := COALESCE(v_perna.stake_freebet, 0);
      v_stake_real := COALESCE(v_perna.stake_real, GREATEST(v_stake - v_stake_freebet, 0));
      v_is_freebet_perna := v_stake_freebet > 0 AND v_stake_real <= 0;
      v_perna_tipo_uso := CASE WHEN v_is_freebet_perna THEN 'FREEBET' ELSE 'NORMAL' END;
      v_perna_stake_evento := CASE WHEN v_is_freebet_perna THEN 'FREEBET_STAKE' ELSE 'STAKE' END;

      -- =========================================================
      -- BACKFILL: garantir STAKE event para a perna (auto-healing)
      -- =========================================================
      IF v_perna.bookmaker_id IS NOT NULL THEN
        SELECT EXISTS(
          SELECT 1 FROM financial_events
          WHERE aposta_id = p_aposta_id
            AND idempotency_key = 'stake_' || p_aposta_id::TEXT || '_perna_' || v_perna.id::TEXT
        ) INTO v_stake_event_exists;

        IF NOT v_stake_event_exists THEN
          INSERT INTO financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            valor, moeda, idempotency_key, descricao, processed_at, created_by
          ) VALUES (
            v_perna.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
            v_perna_stake_evento, v_perna_tipo_uso,
            -v_stake, v_perna.moeda,
            'stake_' || p_aposta_id::TEXT || '_perna_' || v_perna.id::TEXT,
            format('Backfill stake perna %s (multi-entry)', v_perna.ordem),
            now(), auth.uid()
          ) ON CONFLICT DO NOTHING;
        END IF;

        -- =========================================================
        -- BACKFILL: payout/refund baseado no resultado ANTERIOR
        -- (somente se aposta já estava liquidada)
        -- =========================================================
        IF v_resultado_anterior IS NOT NULL AND v_resultado_anterior <> 'PENDENTE' THEN
          v_perna_payout := CASE v_resultado_anterior
            WHEN 'GREEN' THEN
              CASE WHEN v_is_freebet_perna
                THEN v_stake_freebet * (v_odd - 1)
                ELSE v_stake_real * v_odd + v_stake_freebet * (v_odd - 1)
              END
            WHEN 'MEIO_GREEN' THEN
              CASE WHEN v_is_freebet_perna
                THEN v_stake_freebet * (v_odd - 1) / 2
                ELSE v_stake_real + v_stake_real * (v_odd - 1) / 2 + v_stake_freebet * (v_odd - 1) / 2
              END
            WHEN 'VOID' THEN v_stake_real -- só devolve a parte real
            WHEN 'MEIO_RED' THEN v_stake_real / 2
            WHEN 'RED' THEN 0
            ELSE 0
          END;

          v_perna_tipo_evento := CASE 
            WHEN v_resultado_anterior IN ('GREEN','MEIO_GREEN') THEN 
              CASE WHEN v_is_freebet_perna THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END
            WHEN v_resultado_anterior IN ('VOID','MEIO_RED') THEN 'VOID_REFUND'
            ELSE NULL
          END;

          IF v_perna_payout > 0 AND v_perna_tipo_evento IS NOT NULL THEN
            SELECT EXISTS(
              SELECT 1 FROM financial_events
              WHERE aposta_id = p_aposta_id
                AND idempotency_key = 'payout_' || p_aposta_id::TEXT || '_perna_' || v_perna.id::TEXT
            ) INTO v_payout_event_exists;

            IF NOT v_payout_event_exists THEN
              INSERT INTO financial_events (
                bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                valor, moeda, idempotency_key, descricao, processed_at, created_by
              ) VALUES (
                v_perna.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                v_perna_tipo_evento, v_perna_tipo_uso,
                v_perna_payout, v_perna.moeda,
                'payout_' || p_aposta_id::TEXT || '_perna_' || v_perna.id::TEXT,
                format('Backfill payout perna %s (%s)', v_perna.ordem, v_resultado_anterior),
                now(), auth.uid()
              ) ON CONFLICT DO NOTHING;
            END IF;
          END IF;
        END IF;
      END IF;

      -- ============== Se houver mudança de resultado, calcular AJUSTE delta ==============
      IF v_resultado_anterior IS DISTINCT FROM p_novo_resultado THEN
        v_impacto_anterior := 
          CASE v_resultado_anterior
            WHEN 'GREEN' THEN v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)
            WHEN 'MEIO_GREEN' THEN (v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)) / 2
            WHEN 'VOID' THEN 0
            WHEN 'MEIO_RED' THEN -v_stake_real / 2
            WHEN 'RED' THEN -v_stake_real
            ELSE -v_stake_real
          END;

        v_impacto_novo := 
          CASE p_novo_resultado
            WHEN 'GREEN' THEN v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)
            WHEN 'MEIO_GREEN' THEN (v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)) / 2
            WHEN 'VOID' THEN 0
            WHEN 'MEIO_RED' THEN -v_stake_real / 2
            WHEN 'RED' THEN -v_stake_real
            ELSE -v_stake_real
          END;

        v_diferenca := v_impacto_novo - v_impacto_anterior;
        v_total_diferenca := v_total_diferenca + v_diferenca;

        UPDATE apostas_pernas
        SET
          resultado = p_novo_resultado,
          lucro_prejuizo = v_impacto_novo,
          updated_at = now()
        WHERE id = v_perna.id;

        v_idempotency_key := 'reliq_perna_' || v_perna.id::TEXT || '_' ||
                             COALESCE(v_resultado_anterior, 'NULL') || '_to_' || p_novo_resultado;

        IF v_perna.bookmaker_id IS NOT NULL AND v_diferenca <> 0 THEN
          SELECT id INTO v_evento_existente
          FROM financial_events WHERE idempotency_key = v_idempotency_key;

          IF v_evento_existente IS NULL THEN
            INSERT INTO financial_events (
              bookmaker_id, aposta_id, tipo_evento, tipo_uso,
              valor, moeda, workspace_id, idempotency_key, created_by, processed_at, descricao
            ) VALUES (
              v_perna.bookmaker_id, p_aposta_id, 'AJUSTE', v_perna_tipo_uso,
              v_diferenca, v_perna.moeda, v_aposta.workspace_id, v_idempotency_key, auth.uid(), now(),
              format('Reliquidação multi-entry perna %s (%s -> %s) [real=%s fb=%s]',
                     v_perna.ordem, COALESCE(v_resultado_anterior,'NULL'), p_novo_resultado,
                     v_stake_real, v_stake_freebet)
            );
          END IF;
        END IF;
      ELSE
        -- Mesmo resultado: ainda atualizar perna se ela não tem resultado registrado
        IF v_perna.resultado IS NULL OR v_perna.resultado <> p_novo_resultado THEN
          v_impacto_novo := 
            CASE p_novo_resultado
              WHEN 'GREEN' THEN v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)
              WHEN 'MEIO_GREEN' THEN (v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)) / 2
              WHEN 'VOID' THEN 0
              WHEN 'MEIO_RED' THEN -v_stake_real / 2
              WHEN 'RED' THEN -v_stake_real
              ELSE 0
            END;
          UPDATE apostas_pernas
          SET resultado = p_novo_resultado,
              lucro_prejuizo = v_impacto_novo,
              updated_at = now()
          WHERE id = v_perna.id;
        END IF;
      END IF;
    END LOOP;

    -- Lucro do pai = soma das pernas (moeda nativa)
    SELECT COALESCE(SUM(lucro_prejuizo), 0) INTO v_novo_lucro
    FROM apostas_pernas WHERE aposta_id = p_aposta_id;

    IF p_lucro_prejuizo IS NOT NULL THEN
      v_novo_lucro := p_lucro_prejuizo;
    END IF;

    UPDATE apostas_unificada
    SET
      resultado = p_novo_resultado,
      status = 'LIQUIDADA',
      lucro_prejuizo = v_novo_lucro,
      updated_at = now()
    WHERE id = p_aposta_id;

    RETURN jsonb_build_object(
      'success', true,
      'multi_entry', true,
      'pernas_processadas', v_perna_count,
      'resultado_anterior', v_resultado_anterior,
      'resultado_novo', p_novo_resultado,
      'diferenca_total_nominal', v_total_diferenca,
      'lucro_prejuizo', v_novo_lucro
    );
  END IF;

  -- ============== SINGLE-ENTRY PATH (preserva comportamento original) ==============
  IF v_resultado_anterior = p_novo_resultado THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já é o mesmo', 'resultado', p_novo_resultado);
  END IF;

  v_stake := COALESCE(v_aposta.stake, 0);
  v_odd := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);
  v_bookmaker_id := v_aposta.bookmaker_id;
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_moeda := v_aposta.moeda;
  v_is_freebet := (v_aposta.usar_freebet OR v_aposta.fonte_saldo = 'FREEBET');
  v_tipo_uso := CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END;
  
  v_impacto_anterior := CASE v_resultado_anterior
    WHEN 'GREEN' THEN v_stake * (v_odd - 1)
    WHEN 'MEIO_GREEN' THEN v_stake * (v_odd - 1) / 2
    WHEN 'VOID' THEN 0
    WHEN 'MEIO_RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake / 2 END
    WHEN 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
    ELSE CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
  END;
  
  v_impacto_novo := CASE p_novo_resultado
    WHEN 'GREEN' THEN v_stake * (v_odd - 1)
    WHEN 'MEIO_GREEN' THEN v_stake * (v_odd - 1) / 2
    WHEN 'VOID' THEN 0
    WHEN 'MEIO_RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake / 2 END
    WHEN 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
    ELSE CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
  END;
  
  v_diferenca := v_impacto_novo - v_impacto_anterior;
  
  IF p_lucro_prejuizo IS NOT NULL THEN
    v_novo_lucro := p_lucro_prejuizo;
  ELSE
    v_novo_lucro := CASE p_novo_resultado
      WHEN 'GREEN' THEN v_stake * (v_odd - 1)
      WHEN 'MEIO_GREEN' THEN v_stake * (v_odd - 1) / 2
      WHEN 'VOID' THEN 0
      WHEN 'MEIO_RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake / 2 END
      WHEN 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
      ELSE 0
    END;
  END IF;
  
  v_idempotency_key := 'reliq_' || p_aposta_id::TEXT || '_' || 
                       COALESCE(v_resultado_anterior, 'NULL') || '_to_' || p_novo_resultado;
  
  IF v_bookmaker_id IS NOT NULL AND v_diferenca <> 0 THEN
    SELECT id INTO v_evento_existente
    FROM financial_events WHERE idempotency_key = v_idempotency_key;
    
    IF v_evento_existente IS NULL THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, tipo_evento, tipo_uso,
        valor, moeda, workspace_id, idempotency_key, created_by, processed_at, descricao
      ) VALUES (
        v_bookmaker_id, p_aposta_id, 'AJUSTE', v_tipo_uso,
        v_diferenca, v_moeda, v_workspace_id, v_idempotency_key, auth.uid(), now(),
        format('Reliquidação single-entry (%s -> %s)', COALESCE(v_resultado_anterior,'NULL'), p_novo_resultado)
      );
    END IF;
  END IF;
  
  UPDATE apostas_unificada
  SET
    resultado = p_novo_resultado,
    status = 'LIQUIDADA',
    lucro_prejuizo = v_novo_lucro,
    updated_at = now()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'multi_entry', false,
    'resultado_anterior', v_resultado_anterior,
    'resultado_novo', p_novo_resultado,
    'diferenca', v_diferenca,
    'lucro_prejuizo', v_novo_lucro
  );
END;
$function$;

-- =====================================================
-- BACKFILL: reprocessar apostas multi-entry já LIQUIDADAS sem ledger
-- =====================================================
DO $$
DECLARE
  v_aposta_id UUID;
  v_resultado TEXT;
BEGIN
  FOR v_aposta_id, v_resultado IN
    SELECT au.id, au.resultado
    FROM apostas_unificada au
    JOIN apostas_pernas ap ON ap.aposta_id = au.id
    LEFT JOIN financial_events fe ON fe.aposta_id = au.id
    WHERE au.bookmaker_id IS NULL
      AND au.forma_registro <> 'ARBITRAGEM'
      AND au.status = 'LIQUIDADA'
      AND au.resultado IS NOT NULL
    GROUP BY au.id, au.resultado
    HAVING COUNT(fe.id) = 0
  LOOP
    -- Chamar v6 com o mesmo resultado: vai disparar o backfill de STAKE+PAYOUT
    PERFORM public.reliquidar_aposta_v6(v_aposta_id, v_resultado, NULL);
    RAISE NOTICE 'Backfill multi-entry aposta %', v_aposta_id;
  END LOOP;
END $$;