-- ============================================================================
-- FIX: liquidar_aposta_v4 - Propagar resultado/lucro_prejuizo para apostas_pernas
-- ============================================================================
-- O bug: a função criava STAKE/PAYOUT em financial_events corretamente, mas
-- NÃO atualizava apostas_pernas.resultado nem apostas_pernas.lucro_prejuizo.
-- O trigger fn_recalc_aposta_consolidado depende desses campos para calcular
-- pl_consolidado em apostas multi-currency.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.liquidar_aposta_v4(
  p_aposta_id uuid,
  p_resultado text,
  p_lucro_prejuizo numeric DEFAULT NULL::numeric
)
RETURNS TABLE(success boolean, events_created integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_perna_lucro NUMERIC;
  v_perna_tipo_evento TEXT;
  v_perna_tipo_uso TEXT;
  v_perna_stake_evento TEXT;
  v_is_freebet_aposta BOOLEAN;
  v_is_freebet_perna BOOLEAN;
  v_use_provided_pl BOOLEAN := FALSE;
  v_proj_cotacao NUMERIC;
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
  v_use_provided_pl := (p_lucro_prejuizo IS NOT NULL AND NOT v_has_pernas);

  -- Cotação genérica de trabalho (USD) para snapshot das pernas
  SELECT COALESCE(cotacao_trabalho, 1) INTO v_proj_cotacao 
  FROM projetos WHERE id = v_aposta.projeto_id;

  IF v_has_pernas THEN
    -- ============== MULTI-ENTRY ==============
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

      -- Calcular payout e lucro da perna em moeda nativa
      CASE p_resultado
        WHEN 'GREEN' THEN
          IF v_is_freebet_perna THEN
            v_perna_payout := v_perna.stake * (v_perna.odd - 1);
            v_perna_lucro := v_perna.stake * (v_perna.odd - 1);
            v_perna_tipo_evento := 'FREEBET_PAYOUT';
          ELSE
            v_perna_payout := v_perna.stake * v_perna.odd;
            v_perna_lucro := v_perna.stake * (v_perna.odd - 1);
            v_perna_tipo_evento := 'PAYOUT';
          END IF;
        WHEN 'RED' THEN
          v_perna_payout := 0;
          v_perna_lucro := CASE WHEN v_is_freebet_perna THEN 0 ELSE -v_perna.stake END;
          v_perna_tipo_evento := NULL;
        WHEN 'VOID' THEN
          v_perna_payout := v_perna.stake;
          v_perna_lucro := 0;
          v_perna_tipo_evento := 'VOID_REFUND';
        WHEN 'MEIO_GREEN' THEN
          IF v_is_freebet_perna THEN
            v_perna_payout := v_perna.stake * (v_perna.odd - 1) / 2;
            v_perna_lucro := v_perna.stake * (v_perna.odd - 1) / 2;
            v_perna_tipo_evento := 'FREEBET_PAYOUT';
          ELSE
            v_perna_payout := v_perna.stake + (v_perna.stake * (v_perna.odd - 1) / 2);
            v_perna_lucro := v_perna.stake * (v_perna.odd - 1) / 2;
            v_perna_tipo_evento := 'PAYOUT';
          END IF;
        WHEN 'MEIO_RED' THEN
          IF v_is_freebet_perna THEN
            v_perna_payout := 0;
            v_perna_lucro := 0;
            v_perna_tipo_evento := NULL;
          ELSE
            v_perna_payout := v_perna.stake / 2;
            v_perna_lucro := -(v_perna.stake / 2);
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

      -- ✅ FIX CRÍTICO: propagar resultado e lucro para a perna
      UPDATE apostas_pernas
      SET 
        resultado = p_resultado,
        lucro_prejuizo = v_perna_lucro,
        cotacao_snapshot = COALESCE(cotacao_snapshot, v_proj_cotacao),
        cotacao_snapshot_at = COALESCE(cotacao_snapshot_at, now()),
        updated_at = now()
      WHERE id = v_perna.id;
    END LOOP;

  ELSE
    -- ============== SINGLE-ENTRY (mantido idêntico ao original) ==============
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

    IF v_use_provided_pl THEN
      IF v_is_freebet_aposta THEN
        IF p_lucro_prejuizo > 0 THEN
          v_payout := p_lucro_prejuizo;
          v_tipo_evento := 'FREEBET_PAYOUT';
        ELSE
          v_payout := 0;
          v_tipo_evento := NULL;
        END IF;
      ELSE
        v_payout := v_aposta.stake + p_lucro_prejuizo;
        IF v_payout <= 0 THEN
          v_payout := 0;
          v_tipo_evento := NULL;
        ELSIF p_lucro_prejuizo >= 0 THEN
          v_tipo_evento := 'PAYOUT';
        ELSE
          v_tipo_evento := 'VOID_REFUND';
        END IF;
      END IF;
    ELSE
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
          v_payout := 0; v_tipo_evento := NULL;
        WHEN 'VOID' THEN
          v_payout := v_aposta.stake; v_tipo_evento := 'VOID_REFUND';
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
            v_payout := 0; v_tipo_evento := NULL;
          ELSE
            v_payout := v_aposta.stake / 2; v_tipo_evento := 'VOID_REFUND';
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

  -- UPDATE com P&L correto (trigger fn_recalc_aposta_consolidado vai recalcular pl_consolidado)
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
$function$;

-- ============================================================================
-- BACKFILL: corrigir apostas multi-entry já liquidadas com pernas vazias
-- ============================================================================
DO $$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_lucro NUMERIC;
  v_is_fb BOOLEAN;
  v_proj_cot NUMERIC;
BEGIN
  FOR v_aposta IN
    SELECT au.* 
    FROM apostas_unificada au
    WHERE au.status = 'LIQUIDADA'
      AND au.resultado IS NOT NULL
      AND EXISTS(
        SELECT 1 FROM apostas_pernas ap 
        WHERE ap.aposta_id = au.id AND ap.lucro_prejuizo IS NULL
      )
  LOOP
    SELECT COALESCE(cotacao_trabalho, 1) INTO v_proj_cot 
    FROM projetos WHERE id = v_aposta.projeto_id;
    
    FOR v_perna IN 
      SELECT * FROM apostas_pernas WHERE aposta_id = v_aposta.id
    LOOP
      v_is_fb := COALESCE(v_perna.fonte_saldo, 'REAL') = 'FREEBET';
      v_lucro := CASE v_aposta.resultado
        WHEN 'GREEN' THEN v_perna.stake * (v_perna.odd - 1)
        WHEN 'MEIO_GREEN' THEN v_perna.stake * (v_perna.odd - 1) / 2
        WHEN 'VOID' THEN 0
        WHEN 'MEIO_RED' THEN CASE WHEN v_is_fb THEN 0 ELSE -(v_perna.stake / 2) END
        WHEN 'RED' THEN CASE WHEN v_is_fb THEN 0 ELSE -v_perna.stake END
        ELSE 0
      END;
      
      UPDATE apostas_pernas
      SET 
        resultado = COALESCE(resultado, v_aposta.resultado),
        lucro_prejuizo = COALESCE(lucro_prejuizo, v_lucro),
        cotacao_snapshot = COALESCE(cotacao_snapshot, v_proj_cot),
        cotacao_snapshot_at = COALESCE(cotacao_snapshot_at, v_aposta.updated_at, now()),
        updated_at = now()
      WHERE id = v_perna.id;
    END LOOP;
  END LOOP;
END $$;

-- Disparar o trigger fn_recalc_aposta_consolidado em todas as apostas multi-entry liquidadas
-- (toggle resultado para mesmo valor não dispara — então fazemos um touch via updated_at)
UPDATE apostas_unificada au
SET updated_at = now()
WHERE au.status = 'LIQUIDADA' 
  AND EXISTS(SELECT 1 FROM apostas_pernas WHERE aposta_id = au.id);

-- O trigger só recalcula no UPDATE com mudança de status. Forçar recálculo manual:
DO $$
DECLARE
  v_aposta RECORD;
  v_proj RECORD;
  v_perna RECORD;
  v_total_consol NUMERIC;
  v_rate_p NUMERIC;
  v_rate_c NUMERIC;
  v_distinct INT;
  v_is_multi BOOLEAN;
BEGIN
  FOR v_aposta IN
    SELECT au.id, au.projeto_id
    FROM apostas_unificada au
    WHERE au.status = 'LIQUIDADA'
      AND EXISTS(SELECT 1 FROM apostas_pernas WHERE aposta_id = au.id)
  LOOP
    SELECT
      COALESCE(moeda_consolidacao, 'BRL') as moeda_consolidacao,
      COALESCE(cotacao_trabalho, 1) as r_usd,
      COALESCE(cotacao_trabalho_eur, 1) as r_eur,
      COALESCE(cotacao_trabalho_gbp, 1) as r_gbp,
      COALESCE(cotacao_trabalho_myr, 1) as r_myr,
      COALESCE(cotacao_trabalho_mxn, 1) as r_mxn,
      COALESCE(cotacao_trabalho_ars, 1) as r_ars,
      COALESCE(cotacao_trabalho_cop, 1) as r_cop
    INTO v_proj FROM projetos WHERE id = v_aposta.projeto_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT COUNT(DISTINCT moeda) INTO v_distinct FROM apostas_pernas WHERE aposta_id = v_aposta.id;
    v_is_multi := v_distinct > 1
      OR EXISTS(SELECT 1 FROM apostas_pernas WHERE aposta_id = v_aposta.id AND moeda <> v_proj.moeda_consolidacao);

    v_rate_c := CASE v_proj.moeda_consolidacao
      WHEN 'BRL' THEN 1 WHEN 'USD' THEN v_proj.r_usd WHEN 'EUR' THEN v_proj.r_eur
      WHEN 'GBP' THEN v_proj.r_gbp WHEN 'MYR' THEN v_proj.r_myr WHEN 'MXN' THEN v_proj.r_mxn
      WHEN 'ARS' THEN v_proj.r_ars WHEN 'COP' THEN v_proj.r_cop ELSE 1
    END;
    IF v_rate_c = 0 THEN v_rate_c := 1; END IF;

    v_total_consol := 0;
    FOR v_perna IN
      SELECT moeda, COALESCE(lucro_prejuizo, 0) as lp FROM apostas_pernas WHERE aposta_id = v_aposta.id
    LOOP
      v_rate_p := CASE v_perna.moeda
        WHEN 'BRL' THEN 1 WHEN 'USD' THEN v_proj.r_usd WHEN 'EUR' THEN v_proj.r_eur
        WHEN 'GBP' THEN v_proj.r_gbp WHEN 'MYR' THEN v_proj.r_myr WHEN 'MXN' THEN v_proj.r_mxn
        WHEN 'ARS' THEN v_proj.r_ars WHEN 'COP' THEN v_proj.r_cop ELSE 1
      END;
      IF v_rate_p = 0 THEN v_rate_p := 1; END IF;
      v_total_consol := v_total_consol + (v_perna.lp * v_rate_p) / v_rate_c;
    END LOOP;

    UPDATE apostas_unificada
    SET 
      pl_consolidado = v_total_consol,
      consolidation_currency = v_proj.moeda_consolidacao,
      is_multicurrency = v_is_multi,
      moeda_operacao = CASE WHEN v_is_multi THEN 'MULTI' ELSE moeda_operacao END,
      lucro_prejuizo = CASE WHEN v_is_multi THEN v_total_consol ELSE lucro_prejuizo END
    WHERE id = v_aposta.id;
  END LOOP;
END $$;