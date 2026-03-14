
-- ============================================================================
-- FIX: liquidar_aposta_v4 - Suportar multi-entry (apostas simples com múltiplas pernas)
-- 
-- PROBLEMA: Quando uma aposta simples tem múltiplas entradas (apostas_pernas),
-- a RPC só criava eventos financeiros para o bookmaker_id do registro pai.
-- As demais bookmakers não recebiam STAKE debit nem PAYOUT credit.
--
-- SOLUÇÃO: Se existem pernas em apostas_pernas, iterar sobre cada uma e criar
-- eventos financeiros individuais por bookmaker, com stake/odd de cada perna.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.liquidar_aposta_v4(
  p_aposta_id UUID,
  p_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, events_created INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_payout NUMERIC := 0;
  v_event_id UUID;
  v_events_count INTEGER := 0;
  v_tipo_evento TEXT;
  v_tipo_uso TEXT;
  v_stake_evento TEXT;
  v_has_stake_event BOOLEAN := FALSE;
  v_odd NUMERIC;
  v_has_pernas BOOLEAN := FALSE;
  v_perna_count INTEGER := 0;
  -- Per-perna variables
  v_perna_payout NUMERIC;
  v_perna_tipo_evento TEXT;
  v_perna_tipo_uso TEXT;
  v_perna_stake_evento TEXT;
BEGIN
  -- Buscar aposta
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;

  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;

  IF v_aposta.status = 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta já liquidada'::TEXT;
    RETURN;
  END IF;

  -- Verificar se tem pernas em apostas_pernas (multi-entry)
  SELECT COUNT(*) INTO v_perna_count FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  v_has_pernas := v_perna_count > 0;

  -- FIX: Usar odd_final como fallback para MULTIPLA
  v_odd := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);

  IF v_has_pernas THEN
    -- ================================================================
    -- MULTI-ENTRY: Processar cada perna individualmente
    -- ================================================================
    FOR v_perna IN 
      SELECT * FROM apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
    LOOP
      -- Determinar tipo de uso por perna
      IF v_perna.fonte_saldo = 'FREEBET' THEN
        v_perna_tipo_uso := 'FREEBET';
        v_perna_stake_evento := 'FREEBET_STAKE';
      ELSE
        v_perna_tipo_uso := 'NORMAL';
        v_perna_stake_evento := 'STAKE';
      END IF;

      -- Verificar se STAKE já existe para esta perna
      SELECT EXISTS(
        SELECT 1 FROM financial_events
        WHERE aposta_id = v_aposta.id
          AND tipo_evento = v_perna_stake_evento
          AND idempotency_key = 'stake_' || v_aposta.id::TEXT || '_perna_' || v_perna.id::TEXT
      ) INTO v_has_stake_event;

      IF NOT v_has_stake_event THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_perna.bookmaker_id,
          v_aposta.id,
          v_aposta.workspace_id,
          v_perna_stake_evento,
          v_perna_tipo_uso,
          -v_perna.stake,
          v_perna.moeda,
          'stake_' || v_aposta.id::TEXT || '_perna_' || v_perna.id::TEXT,
          format('Débito stake perna %s (multi-entry)', v_perna.ordem),
          now(),
          auth.uid()
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_event_id;

        IF v_event_id IS NOT NULL THEN
          v_events_count := v_events_count + 1;
        END IF;
      END IF;

      -- Calcular payout por perna
      CASE p_resultado
        WHEN 'GREEN' THEN
          IF v_perna_tipo_uso = 'FREEBET' THEN
            v_perna_payout := v_perna.stake * (v_perna.odd - 1);
            v_perna_tipo_evento := 'FREEBET_PAYOUT';
          ELSE
            v_perna_payout := v_perna.stake * v_perna.odd;
            v_perna_tipo_evento := 'PAYOUT';
          END IF;

        WHEN 'RED' THEN
          v_perna_payout := 0;
          v_perna_tipo_evento := NULL;

        WHEN 'VOID' THEN
          v_perna_payout := v_perna.stake;
          v_perna_tipo_evento := 'VOID_REFUND';

        WHEN 'MEIO_GREEN' THEN
          IF v_perna_tipo_uso = 'FREEBET' THEN
            v_perna_payout := v_perna.stake * (v_perna.odd - 1) / 2;
            v_perna_tipo_evento := 'FREEBET_PAYOUT';
          ELSE
            v_perna_payout := v_perna.stake + (v_perna.stake * (v_perna.odd - 1) / 2);
            v_perna_tipo_evento := 'PAYOUT';
          END IF;

        WHEN 'MEIO_RED' THEN
          v_perna_payout := v_perna.stake / 2;
          v_perna_tipo_evento := 'VOID_REFUND';

        ELSE
          RETURN QUERY SELECT FALSE, 0, format('Resultado inválido: %s', p_resultado)::TEXT;
          RETURN;
      END CASE;

      -- Criar evento de payout para esta perna
      IF v_perna_tipo_evento IS NOT NULL AND v_perna_payout > 0 THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_perna.bookmaker_id,
          v_aposta.id,
          v_aposta.workspace_id,
          v_perna_tipo_evento,
          CASE WHEN v_perna_tipo_evento LIKE 'FREEBET%' THEN 'NORMAL' ELSE v_perna_tipo_uso END,
          'LUCRO',
          v_perna_payout,
          v_perna.moeda,
          'payout_' || v_aposta.id::TEXT || '_perna_' || v_perna.id::TEXT || '_' || p_resultado,
          format('Payout %s perna %s: %s (odd=%s)', p_resultado, v_perna.ordem, v_perna_payout, v_perna.odd),
          now(),
          auth.uid()
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_event_id;

        IF v_event_id IS NOT NULL THEN
          v_events_count := v_events_count + 1;
        END IF;
      END IF;
    END LOOP;

  ELSE
    -- ================================================================
    -- SINGLE-ENTRY: Comportamento original (sem pernas)
    -- ================================================================
    
    -- Determinar tipo de uso
    IF v_aposta.fonte_saldo = 'FREEBET' OR v_aposta.usar_freebet THEN
      v_tipo_uso := 'FREEBET';
      v_stake_evento := 'FREEBET_STAKE';
    ELSE
      v_tipo_uso := 'NORMAL';
      v_stake_evento := 'STAKE';
    END IF;

    -- GARANTIA DE INTEGRIDADE (LEGADO): STAKE pode não existir
    SELECT EXISTS(
      SELECT 1
      FROM financial_events
      WHERE aposta_id = v_aposta.id
        AND tipo_evento = v_stake_evento
        AND idempotency_key = 'stake_' || v_aposta.id::TEXT
    ) INTO v_has_stake_event;

    IF NOT v_has_stake_event THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_aposta.bookmaker_id,
        v_aposta.id,
        v_aposta.workspace_id,
        v_stake_evento,
        v_tipo_uso,
        -v_aposta.stake,
        v_aposta.moeda_operacao,
        'stake_' || v_aposta.id::TEXT,
        'Débito de stake para aposta (auto-heal na liquidação)',
        now(),
        auth.uid()
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_event_id;

      v_events_count := v_events_count + 1;
    END IF;

    -- Calcular payout baseado no resultado
    CASE p_resultado
      WHEN 'GREEN' THEN
        IF v_tipo_uso = 'FREEBET' THEN
          v_payout := v_aposta.stake * (v_odd - 1);
          v_tipo_evento := 'FREEBET_PAYOUT';
        ELSE
          v_payout := v_aposta.stake * v_odd;
          v_tipo_evento := 'PAYOUT';
        END IF;

      WHEN 'RED' THEN
        v_payout := 0;
        v_tipo_evento := NULL;

      WHEN 'VOID' THEN
        v_payout := v_aposta.stake;
        v_tipo_evento := 'VOID_REFUND';

      WHEN 'MEIO_GREEN' THEN
        IF v_tipo_uso = 'FREEBET' THEN
          v_payout := v_aposta.stake * (v_odd - 1) / 2;
          v_tipo_evento := 'FREEBET_PAYOUT';
        ELSE
          v_payout := v_aposta.stake + (v_aposta.stake * (v_odd - 1) / 2);
          v_tipo_evento := 'PAYOUT';
        END IF;

      WHEN 'MEIO_RED' THEN
        v_payout := v_aposta.stake / 2;
        v_tipo_evento := 'VOID_REFUND';

      ELSE
        RETURN QUERY SELECT FALSE, 0, format('Resultado inválido: %s', p_resultado)::TEXT;
        RETURN;
    END CASE;

    -- Criar evento de payout se aplicável
    IF v_tipo_evento IS NOT NULL AND v_payout > 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_aposta.bookmaker_id,
        v_aposta.id,
        v_aposta.workspace_id,
        v_tipo_evento,
        CASE WHEN v_tipo_evento LIKE 'FREEBET%' THEN 'NORMAL' ELSE v_tipo_uso END,
        'LUCRO',
        v_payout,
        v_aposta.moeda_operacao,
        'payout_' || v_aposta.id::TEXT || '_' || p_resultado,
        format('Payout %s: %s (odd=%s)', p_resultado, v_payout, v_odd),
        now(),
        auth.uid()
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_event_id;

      IF v_event_id IS NOT NULL THEN
        v_events_count := v_events_count + 1;
      END IF;
    END IF;
  END IF;

  -- Atualizar status da aposta (mesmo para ambos os fluxos)
  UPDATE apostas_unificada
  SET 
    status = 'LIQUIDADA',
    resultado = p_resultado,
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, 
      CASE p_resultado
        WHEN 'GREEN' THEN v_aposta.stake * (v_odd - 1)
        WHEN 'MEIO_GREEN' THEN v_aposta.stake * (v_odd - 1) / 2
        WHEN 'VOID' THEN 0
        WHEN 'MEIO_RED' THEN -(v_aposta.stake / 2)
        WHEN 'RED' THEN -v_aposta.stake
        ELSE 0
      END
    ),
    valor_retorno = CASE p_resultado
      WHEN 'GREEN' THEN v_aposta.stake * v_odd
      WHEN 'MEIO_GREEN' THEN v_aposta.stake + (v_aposta.stake * (v_odd - 1) / 2)
      WHEN 'VOID' THEN v_aposta.stake
      WHEN 'MEIO_RED' THEN v_aposta.stake / 2
      WHEN 'RED' THEN 0
      ELSE 0
    END,
    updated_at = now()
  WHERE id = p_aposta_id;

  RETURN QUERY SELECT TRUE, v_events_count, format('Liquidação concluída: %s (%s pernas)', p_resultado, CASE WHEN v_has_pernas THEN v_perna_count ELSE 1 END)::TEXT;
END;
$$;
