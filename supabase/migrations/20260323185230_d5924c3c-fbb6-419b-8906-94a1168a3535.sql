
-- ============================================================================
-- FIX CRÍTICO: liquidar_aposta_v4 - Usar p_lucro_prejuizo para calcular payout
-- 
-- PROBLEMA: Para apostas múltiplas com resultados por perna (ex: ½ Red + Green),
-- o frontend calcula P&L correto (R$ 41,25) mas a RPC ignora esse valor
-- e usa a fórmula genérica MEIO_GREEN na odd combinada (dá R$ 259,69 errado).
-- 
-- CORREÇÃO: Quando p_lucro_prejuizo é fornecido, derivar o payout dele
-- ao invés de usar a fórmula genérica baseada no resultado global.
-- ============================================================================

DROP FUNCTION IF EXISTS public.liquidar_aposta_v4(uuid, text, numeric);

CREATE OR REPLACE FUNCTION public.liquidar_aposta_v4(
  p_aposta_id UUID,
  p_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, events_created INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
  v_perna_payout NUMERIC;
  v_perna_tipo_evento TEXT;
  v_perna_tipo_uso TEXT;
  v_perna_stake_evento TEXT;
  v_is_freebet_aposta BOOLEAN;
  v_is_freebet_perna BOOLEAN;
  v_use_provided_pl BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;

  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;

  IF v_aposta.status = 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta já liquidada'::TEXT;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_perna_count FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  v_has_pernas := v_perna_count > 0;
  v_odd := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);
  v_is_freebet_aposta := COALESCE(v_aposta.fonte_saldo = 'FREEBET' OR v_aposta.usar_freebet, FALSE);

  -- Determinar se devemos usar p_lucro_prejuizo para o payout
  -- (apostas múltiplas com resultados por perna passam o P&L correto)
  v_use_provided_pl := (p_lucro_prejuizo IS NOT NULL AND NOT v_has_pernas);

  IF v_has_pernas THEN
    -- ============== MULTI-ENTRY (surebets, apostas simples com múltiplas entradas) ==============
    FOR v_perna IN 
      SELECT * FROM apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
    LOOP
      v_is_freebet_perna := COALESCE(v_perna.fonte_saldo, 'REAL') = 'FREEBET';
      
      IF v_is_freebet_perna THEN
        v_perna_tipo_uso := 'FREEBET';
        v_perna_stake_evento := 'FREEBET_STAKE';
      ELSE
        v_perna_tipo_uso := 'NORMAL';
        v_perna_stake_evento := 'STAKE';
      END IF;

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
          v_perna.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
          v_perna_stake_evento, v_perna_tipo_uso,
          -v_perna.stake, v_perna.moeda,
          'stake_' || v_aposta.id::TEXT || '_perna_' || v_perna.id::TEXT,
          format('Débito stake perna %s (multi-entry)', v_perna.ordem),
          now(), auth.uid()
        ) ON CONFLICT DO NOTHING
        RETURNING id INTO v_event_id;
        IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
      END IF;

      CASE p_resultado
        WHEN 'GREEN' THEN
          IF v_is_freebet_perna THEN
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
          IF v_is_freebet_perna THEN
            v_perna_payout := v_perna.stake * (v_perna.odd - 1) / 2;
            v_perna_tipo_evento := 'FREEBET_PAYOUT';
          ELSE
            v_perna_payout := v_perna.stake + (v_perna.stake * (v_perna.odd - 1) / 2);
            v_perna_tipo_evento := 'PAYOUT';
          END IF;
        WHEN 'MEIO_RED' THEN
          IF v_is_freebet_perna THEN
            v_perna_payout := 0;
            v_perna_tipo_evento := NULL;
          ELSE
            v_perna_payout := v_perna.stake / 2;
            v_perna_tipo_evento := 'VOID_REFUND';
          END IF;
        ELSE
          RETURN QUERY SELECT FALSE, 0, format('Resultado inválido: %s', p_resultado)::TEXT;
          RETURN;
      END CASE;

      IF v_perna_tipo_evento IS NOT NULL AND v_perna_payout > 0 THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_perna.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
          v_perna_tipo_evento,
          CASE WHEN v_perna_tipo_evento LIKE 'FREEBET%' THEN 'NORMAL' ELSE v_perna_tipo_uso END,
          'LUCRO', v_perna_payout, v_perna.moeda,
          'payout_' || v_aposta.id::TEXT || '_perna_' || v_perna.id::TEXT || '_' || p_resultado,
          format('Payout %s perna %s: %s (odd=%s)', p_resultado, v_perna.ordem, v_perna_payout, v_perna.odd),
          now(), auth.uid()
        ) ON CONFLICT DO NOTHING
        RETURNING id INTO v_event_id;
        IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
      END IF;
    END LOOP;

  ELSE
    -- ============== SINGLE-ENTRY (apostas simples, múltiplas) ==============
    IF v_is_freebet_aposta THEN
      v_tipo_uso := 'FREEBET';
      v_stake_evento := 'FREEBET_STAKE';
    ELSE
      v_tipo_uso := 'NORMAL';
      v_stake_evento := 'STAKE';
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM financial_events
      WHERE aposta_id = v_aposta.id AND tipo_evento = v_stake_evento
        AND idempotency_key = 'stake_' || v_aposta.id::TEXT
    ) INTO v_has_stake_event;

    IF NOT v_has_stake_event THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_aposta.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
        v_stake_evento, v_tipo_uso,
        -v_aposta.stake, v_aposta.moeda_operacao,
        'stake_' || v_aposta.id::TEXT,
        'Débito de stake para aposta (auto-heal na liquidação)',
        now(), auth.uid()
      ) ON CONFLICT DO NOTHING
      RETURNING id INTO v_event_id;
      v_events_count := v_events_count + 1;
    END IF;

    -- ============================================================
    -- NOVO: Quando p_lucro_prejuizo é fornecido, derivar payout dele
    -- (para múltiplas com resultados por perna já calculados no frontend)
    -- ============================================================
    IF v_use_provided_pl THEN
      IF v_is_freebet_aposta THEN
        -- Freebet: payout = lucro (stake não é devolvida)
        IF p_lucro_prejuizo > 0 THEN
          v_payout := p_lucro_prejuizo;
          v_tipo_evento := 'FREEBET_PAYOUT';
        ELSE
          v_payout := 0;
          v_tipo_evento := NULL;
        END IF;
      ELSE
        -- Normal: retorno = stake + lucro
        v_payout := v_aposta.stake + p_lucro_prejuizo;
        IF v_payout <= 0 THEN
          v_payout := 0;
          v_tipo_evento := NULL; -- perda total ou parcial sem retorno
        ELSIF p_lucro_prejuizo >= 0 THEN
          v_tipo_evento := 'PAYOUT'; -- lucro positivo
        ELSE
          v_tipo_evento := 'VOID_REFUND'; -- retorno parcial (menos que stake)
        END IF;
      END IF;
    ELSE
      -- Cálculo padrão por fórmula (apostas simples sem P&L fornecido)
      CASE p_resultado
        WHEN 'GREEN' THEN
          IF v_is_freebet_aposta THEN
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
          IF v_is_freebet_aposta THEN
            v_payout := v_aposta.stake * (v_odd - 1) / 2;
            v_tipo_evento := 'FREEBET_PAYOUT';
          ELSE
            v_payout := v_aposta.stake + (v_aposta.stake * (v_odd - 1) / 2);
            v_tipo_evento := 'PAYOUT';
          END IF;
        WHEN 'MEIO_RED' THEN
          IF v_is_freebet_aposta THEN
            v_payout := 0;
            v_tipo_evento := NULL;
          ELSE
            v_payout := v_aposta.stake / 2;
            v_tipo_evento := 'VOID_REFUND';
          END IF;
        ELSE
          RETURN QUERY SELECT FALSE, 0, format('Resultado inválido: %s', p_resultado)::TEXT;
          RETURN;
      END CASE;
    END IF;

    IF v_tipo_evento IS NOT NULL AND v_payout > 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_aposta.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
        v_tipo_evento,
        CASE WHEN v_tipo_evento LIKE 'FREEBET%' THEN 'NORMAL' ELSE v_tipo_uso END,
        'LUCRO', v_payout, v_aposta.moeda_operacao,
        'payout_' || v_aposta.id::TEXT || '_' || p_resultado,
        format('Payout %s: %s (odd=%s, pl_fornecido=%s)', p_resultado, v_payout, v_odd, v_use_provided_pl),
        now(), auth.uid()
      ) ON CONFLICT DO NOTHING
      RETURNING id INTO v_event_id;
      IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
    END IF;
  END IF;

  -- UPDATE com P&L correto (usar fornecido quando disponível)
  UPDATE apostas_unificada
  SET 
    status = 'LIQUIDADA',
    resultado = p_resultado,
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, 
      CASE p_resultado
        WHEN 'GREEN' THEN v_aposta.stake * (v_odd - 1)
        WHEN 'MEIO_GREEN' THEN v_aposta.stake * (v_odd - 1) / 2
        WHEN 'VOID' THEN 0
        WHEN 'MEIO_RED' THEN CASE WHEN v_is_freebet_aposta THEN 0 ELSE -(v_aposta.stake / 2) END
        WHEN 'RED' THEN CASE WHEN v_is_freebet_aposta THEN 0 ELSE -v_aposta.stake END
        ELSE 0
      END
    ),
    valor_retorno = CASE 
      WHEN p_lucro_prejuizo IS NOT NULL THEN
        CASE WHEN v_is_freebet_aposta 
          THEN GREATEST(p_lucro_prejuizo, 0)
          ELSE v_aposta.stake + p_lucro_prejuizo
        END
      ELSE
        CASE p_resultado
          WHEN 'GREEN' THEN CASE WHEN v_is_freebet_aposta THEN v_aposta.stake * (v_odd - 1) ELSE v_aposta.stake * v_odd END
          WHEN 'MEIO_GREEN' THEN CASE WHEN v_is_freebet_aposta THEN v_aposta.stake * (v_odd - 1) / 2 ELSE v_aposta.stake + (v_aposta.stake * (v_odd - 1) / 2) END
          WHEN 'VOID' THEN v_aposta.stake
          WHEN 'MEIO_RED' THEN CASE WHEN v_is_freebet_aposta THEN 0 ELSE v_aposta.stake / 2 END
          WHEN 'RED' THEN 0
          ELSE 0
        END
    END,
    updated_at = now()
  WHERE id = p_aposta_id;

  RETURN QUERY SELECT TRUE, v_events_count, format('Liquidação concluída: %s (%s pernas, pl_fornecido=%s)', p_resultado, CASE WHEN v_has_pernas THEN v_perna_count ELSE 1 END, v_use_provided_pl)::TEXT;
END;
$fn$;

-- ============================================================================
-- FIX: atualizar_aposta_liquidada_atomica_v2 - Aceitar p_lucro_prejuizo
-- para cálculo correto de impacto em apostas múltiplas com resultados por perna
-- ============================================================================

DROP FUNCTION IF EXISTS public.atualizar_aposta_liquidada_atomica_v2(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.atualizar_aposta_liquidada_atomica_v2(
  p_aposta_id UUID,
  p_novo_bookmaker_id UUID DEFAULT NULL,
  p_novo_stake NUMERIC DEFAULT NULL,
  p_nova_odd NUMERIC DEFAULT NULL,
  p_novo_resultado TEXT DEFAULT NULL,
  p_nova_moeda TEXT DEFAULT NULL,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_workspace_id UUID;
  v_user_id UUID;
  v_resultado_atual TEXT;
  v_bookmaker_anterior_id UUID;
  v_stake_anterior NUMERIC;
  v_odd_anterior NUMERIC;
  v_moeda_anterior TEXT;
  v_lucro_anterior NUMERIC;
  v_bookmaker_novo_id UUID;
  v_stake_novo NUMERIC;
  v_odd_novo NUMERIC;
  v_moeda_nova TEXT;
  v_resultado_novo TEXT;
  v_lucro_novo NUMERIC;
  v_fonte_saldo TEXT;
  v_tipo_uso TEXT;
  v_idempotency_prefix TEXT;
  v_impacto_anterior NUMERIC;
  v_impacto_novo NUMERIC;
  v_diferenca NUMERIC;
  v_is_multipla BOOLEAN;
  v_stake_diff NUMERIC;
  v_net_old NUMERIC;
BEGIN
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;

  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_fonte_saldo := COALESCE(v_aposta.fonte_saldo, 'REAL');
  v_tipo_uso := CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END;
  v_is_multipla := (v_aposta.odd_final IS NOT NULL);
  v_bookmaker_anterior_id := v_aposta.bookmaker_id;
  v_stake_anterior := COALESCE(v_aposta.stake, 0);
  v_odd_anterior := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);
  v_moeda_anterior := COALESCE(v_aposta.moeda_operacao, 'BRL');
  v_bookmaker_novo_id := COALESCE(p_novo_bookmaker_id, v_bookmaker_anterior_id);
  v_stake_novo := COALESCE(p_novo_stake, v_stake_anterior);
  v_odd_novo := COALESCE(p_nova_odd, v_odd_anterior);
  v_moeda_nova := COALESCE(p_nova_moeda, v_moeda_anterior);

  -- ================================================================
  -- PENDENTE: handle stake/bookmaker changes with financial events
  -- ================================================================
  IF v_aposta.status != 'LIQUIDADA' THEN
    v_idempotency_prefix := 'edit_pend_' || p_aposta_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;
    
    IF p_novo_bookmaker_id IS NOT NULL AND p_novo_bookmaker_id != v_bookmaker_anterior_id THEN
      IF v_stake_anterior > 0 THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
          valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
          'REVERSAL', v_tipo_uso, 'REVERSAL',
          v_stake_anterior, v_moeda_anterior,
          v_idempotency_prefix || '_rev_old_bk',
          'Reversão stake por mudança de bookmaker na edição',
          NOW(), v_user_id
        );
      END IF;
      
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
        'STAKE', v_tipo_uso, 'STAKE',
        -v_stake_novo, v_moeda_nova,
        v_idempotency_prefix || '_stake_new_bk',
        'Stake debitada em novo bookmaker por edição',
        NOW(), v_user_id
      );
      
    ELSIF p_novo_stake IS NOT NULL AND p_novo_stake != v_stake_anterior THEN
      v_stake_diff := v_stake_anterior - v_stake_novo;
      
      IF v_stake_diff != 0 THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
          valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
          'AJUSTE', v_tipo_uso, 'AJUSTE',
          v_stake_diff, v_moeda_anterior,
          v_idempotency_prefix || '_stake_adj',
          'Ajuste de stake por edição: ' || v_stake_anterior || ' → ' || v_stake_novo,
          NOW(), v_user_id
        );
      END IF;
    END IF;
    
    UPDATE apostas_unificada
    SET 
      bookmaker_id = v_bookmaker_novo_id,
      stake = v_stake_novo,
      odd = CASE WHEN NOT v_is_multipla THEN COALESCE(p_nova_odd, odd) ELSE odd END,
      odd_final = CASE WHEN v_is_multipla THEN COALESCE(p_nova_odd, odd_final) ELSE odd_final END,
      moeda_operacao = v_moeda_nova,
      resultado = COALESCE(p_novo_resultado, resultado),
      updated_at = NOW()
    WHERE id = p_aposta_id;

    RETURN jsonb_build_object('success', true, 'message', 'Aposta PENDENTE atualizada com ajuste financeiro');
  END IF;

  -- ================================================================
  -- LIQUIDADA: full impact calculation
  -- ================================================================
  v_resultado_atual := v_aposta.resultado;
  v_lucro_anterior := COALESCE(v_aposta.lucro_prejuizo, 0);
  v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);

  IF v_bookmaker_novo_id = v_bookmaker_anterior_id
     AND v_stake_novo = v_stake_anterior
     AND v_odd_novo = v_odd_anterior
     AND v_resultado_novo = v_resultado_atual
     AND p_lucro_prejuizo IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Nenhuma mudança detectada');
  END IF;

  v_idempotency_prefix := 'edit_v2_' || p_aposta_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;

  -- Impacto anterior: retorno total (payout) que foi creditado
  CASE v_resultado_atual
    WHEN 'GREEN' THEN v_impacto_anterior := v_stake_anterior * v_odd_anterior;
    WHEN 'RED' THEN v_impacto_anterior := 0;
    WHEN 'VOID' THEN v_impacto_anterior := v_stake_anterior;
    WHEN 'MEIO_GREEN' THEN v_impacto_anterior := v_stake_anterior * (1 + (v_odd_anterior - 1) / 2);
    WHEN 'MEIO_RED' THEN v_impacto_anterior := v_stake_anterior / 2;
    ELSE v_impacto_anterior := 0;
  END CASE;

  -- Se lucro anterior foi fornecido previamente (múltipla com fatores por perna),
  -- usar o retorno real em vez da fórmula
  IF v_is_multipla AND v_lucro_anterior IS NOT NULL THEN
    -- Para múltiplas, o impacto real pode diferir da fórmula genérica
    -- Usar: retorno = stake + lucro
    v_impacto_anterior := v_stake_anterior + v_lucro_anterior;
  END IF;

  -- Impacto novo: calcular retorno esperado
  IF p_lucro_prejuizo IS NOT NULL THEN
    -- P&L fornecido pelo frontend (múltiplas com fatores por perna)
    v_lucro_novo := p_lucro_prejuizo;
    v_impacto_novo := v_stake_novo + p_lucro_prejuizo;
  ELSE
    CASE v_resultado_novo
      WHEN 'GREEN' THEN
        v_lucro_novo := (v_stake_novo * v_odd_novo) - v_stake_novo;
        v_impacto_novo := v_stake_novo * v_odd_novo;
      WHEN 'RED' THEN
        v_lucro_novo := -v_stake_novo;
        v_impacto_novo := 0;
      WHEN 'VOID' THEN
        v_lucro_novo := 0;
        v_impacto_novo := v_stake_novo;
      WHEN 'MEIO_GREEN' THEN
        v_lucro_novo := ((v_stake_novo * v_odd_novo) - v_stake_novo) / 2;
        v_impacto_novo := v_stake_novo * (1 + (v_odd_novo - 1) / 2);
      WHEN 'MEIO_RED' THEN
        v_lucro_novo := -v_stake_novo / 2;
        v_impacto_novo := v_stake_novo / 2;
      ELSE
        v_lucro_novo := 0;
        v_impacto_novo := 0;
    END CASE;
  END IF;

  v_diferenca := v_impacto_novo - v_impacto_anterior;
  IF v_stake_novo != v_stake_anterior THEN
    v_diferenca := v_diferenca + (v_stake_anterior - v_stake_novo);
  END IF;

  IF v_bookmaker_novo_id != v_bookmaker_anterior_id THEN
    SELECT COALESCE(SUM(valor), 0) INTO v_net_old
    FROM financial_events
    WHERE aposta_id = p_aposta_id AND bookmaker_id = v_bookmaker_anterior_id;
    
    IF v_net_old != 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
        'REVERSAL', v_tipo_uso, 'REVERSAL',
        -v_net_old, v_moeda_anterior,
        v_idempotency_prefix || '_rev_old',
        'Reversão total por mudança de bookmaker na edição',
        NOW(), v_user_id
      );
    END IF;
    
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
      'STAKE', v_tipo_uso, 'STAKE',
      -v_stake_novo, v_moeda_nova,
      v_idempotency_prefix || '_stake_new',
      'Stake na nova bookmaker por edição',
      NOW(), v_user_id
    );
    
    IF v_impacto_novo > 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
        'PAYOUT', v_tipo_uso, 'PAYOUT',
        v_impacto_novo, v_moeda_nova,
        v_idempotency_prefix || '_pay_new',
        'Payout na nova bookmaker por edição',
        NOW(), v_user_id
      );
    END IF;
  ELSE
    IF v_diferenca != 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
      ) VALUES (
        v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
        'AJUSTE', v_tipo_uso, 'AJUSTE',
        v_diferenca, v_moeda_nova,
        v_idempotency_prefix || '_adj',
        'Ajuste por edição de aposta liquidada',
        jsonb_build_object(
          'resultado_anterior', v_resultado_atual,
          'resultado_novo', v_resultado_novo,
          'stake_anterior', v_stake_anterior,
          'stake_novo', v_stake_novo,
          'odd_anterior', v_odd_anterior,
          'odd_novo', v_odd_novo,
          'pl_fornecido', p_lucro_prejuizo
        ),
        NOW(), v_user_id
      );
    END IF;
  END IF;

  UPDATE apostas_unificada
  SET 
    bookmaker_id = v_bookmaker_novo_id,
    stake = v_stake_novo,
    odd = CASE WHEN NOT v_is_multipla THEN v_odd_novo ELSE odd END,
    odd_final = CASE WHEN v_is_multipla THEN v_odd_novo ELSE odd_final END,
    moeda_operacao = v_moeda_nova,
    resultado = v_resultado_novo,
    lucro_prejuizo = v_lucro_novo,
    valor_retorno = CASE 
      WHEN v_fonte_saldo = 'FREEBET' THEN GREATEST(v_lucro_novo, 0)
      ELSE v_stake_novo + v_lucro_novo
    END,
    roi_real = CASE WHEN v_stake_novo > 0 THEN (v_lucro_novo / v_stake_novo) * 100 ELSE 0 END,
    status = 'LIQUIDADA',
    updated_at = NOW()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Aposta atualizada com sucesso',
    'diferenca_aplicada', v_diferenca,
    'lucro_novo', v_lucro_novo,
    'impacto_anterior', v_impacto_anterior,
    'impacto_novo', v_impacto_novo,
    'pl_fornecido', p_lucro_prejuizo IS NOT NULL
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
