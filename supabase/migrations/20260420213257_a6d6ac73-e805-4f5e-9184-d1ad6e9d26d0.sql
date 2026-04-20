-- ============================================================================
-- FIX: Suporte a pernas com stake MISTO (stake_real + stake_freebet)
-- ============================================================================
-- Problema: liquidar_aposta_v4 e reliquidar_aposta_v6 criavam UM único evento
-- STAKE por perna, classificando-o como FREEBET ou NORMAL conforme fonte_saldo.
-- Pernas com split (ex: stake_real=100 + stake_freebet=50) precisam de DOIS
-- eventos: -100 NORMAL + -50 FREEBET. Caso contrário, o sistema tenta debitar
-- 150 FREEBET de um saldo_freebet=50 e dispara PISO_ZERO.
-- ============================================================================

-- 1) liquidar_aposta_v4 com split correto
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
  v_is_freebet_aposta BOOLEAN;
  v_use_provided_pl BOOLEAN := FALSE;
  v_proj_cotacao NUMERIC;
  v_stake_real NUMERIC;
  v_stake_freebet NUMERIC;
  v_payout_real NUMERIC;
  v_payout_freebet NUMERIC;
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

  SELECT COALESCE(cotacao_trabalho, 1) INTO v_proj_cotacao 
  FROM projetos WHERE id = v_aposta.projeto_id;

  IF v_has_pernas THEN
    -- ============== MULTI-ENTRY com SPLIT REAL/FREEBET ==============
    FOR v_perna IN 
      SELECT * FROM apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
    LOOP
      v_stake_real := COALESCE(v_perna.stake_real, 0);
      v_stake_freebet := COALESCE(v_perna.stake_freebet, 0);
      
      -- Se stake_real e stake_freebet ambos zero, fallback para stake total + fonte_saldo
      IF v_stake_real = 0 AND v_stake_freebet = 0 THEN
        IF COALESCE(v_perna.fonte_saldo,'REAL') = 'FREEBET' THEN
          v_stake_freebet := COALESCE(v_perna.stake, 0);
        ELSE
          v_stake_real := COALESCE(v_perna.stake, 0);
        END IF;
      END IF;
      
      -- ===== STAKE NORMAL (parte real) =====
      IF v_stake_real > 0 THEN
        SELECT EXISTS(
          SELECT 1 FROM financial_events
          WHERE aposta_id = v_aposta.id
            AND idempotency_key = 'stake_' || v_aposta.id::TEXT || '_perna_' || v_perna.id::TEXT
        ) INTO v_has_stake_event;

        IF NOT v_has_stake_event THEN
          INSERT INTO financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            valor, moeda, idempotency_key, descricao, processed_at, created_by
          ) VALUES (
            v_perna.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
            'STAKE', 'NORMAL',
            -v_stake_real, v_perna.moeda,
            'stake_' || v_aposta.id::TEXT || '_perna_' || v_perna.id::TEXT,
            format('Débito stake real perna %s (multi-entry)', v_perna.ordem),
            now(), auth.uid()
          ) ON CONFLICT DO NOTHING
          RETURNING id INTO v_event_id;
          IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
        END IF;
      END IF;

      -- ===== STAKE FREEBET (parte freebet) =====
      IF v_stake_freebet > 0 THEN
        SELECT EXISTS(
          SELECT 1 FROM financial_events
          WHERE aposta_id = v_aposta.id
            AND idempotency_key = 'stake_fb_' || v_aposta.id::TEXT || '_perna_' || v_perna.id::TEXT
        ) INTO v_has_stake_event;

        IF NOT v_has_stake_event THEN
          INSERT INTO financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            valor, moeda, idempotency_key, descricao, processed_at, created_by
          ) VALUES (
            v_perna.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
            'FREEBET_STAKE', 'FREEBET',
            -v_stake_freebet, v_perna.moeda,
            'stake_fb_' || v_aposta.id::TEXT || '_perna_' || v_perna.id::TEXT,
            format('Débito stake freebet perna %s (multi-entry)', v_perna.ordem),
            now(), auth.uid()
          ) ON CONFLICT DO NOTHING
          RETURNING id INTO v_event_id;
          IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
        END IF;
      END IF;

      -- ===== Cálculo de payout e lucro por componente =====
      CASE p_resultado
        WHEN 'GREEN' THEN
          -- Real: devolve stake + lucro;  Freebet: só lucro (SNR)
          v_payout_real := v_stake_real * v_perna.odd;
          v_payout_freebet := v_stake_freebet * (v_perna.odd - 1);
          v_perna_lucro := v_stake_real * (v_perna.odd - 1) + v_stake_freebet * (v_perna.odd - 1);
        WHEN 'RED' THEN
          v_payout_real := 0;
          v_payout_freebet := 0;
          v_perna_lucro := -v_stake_real; -- freebet RED: lucro 0
        WHEN 'VOID' THEN
          v_payout_real := v_stake_real;
          v_payout_freebet := 0; -- freebet VOID consome a freebet
          v_perna_lucro := 0;
        WHEN 'MEIO_GREEN' THEN
          v_payout_real := v_stake_real + (v_stake_real * (v_perna.odd - 1) / 2);
          v_payout_freebet := v_stake_freebet * (v_perna.odd - 1) / 2;
          v_perna_lucro := (v_stake_real * (v_perna.odd - 1) / 2) + (v_stake_freebet * (v_perna.odd - 1) / 2);
        WHEN 'MEIO_RED' THEN
          v_payout_real := v_stake_real / 2;
          v_payout_freebet := 0;
          v_perna_lucro := -(v_stake_real / 2);
        ELSE
          RETURN QUERY SELECT FALSE, 0, format('Resultado inválido: %s', p_resultado)::TEXT;
          RETURN;
      END CASE;

      -- ===== PAYOUT NORMAL =====
      IF v_payout_real > 0 THEN
        v_perna_tipo_evento := CASE 
          WHEN p_resultado IN ('GREEN','MEIO_GREEN') THEN 'PAYOUT'
          WHEN p_resultado IN ('VOID','MEIO_RED') THEN 'VOID_REFUND'
          ELSE NULL
        END;
        IF v_perna_tipo_evento IS NOT NULL THEN
          INSERT INTO financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
          ) VALUES (
            v_perna.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
            v_perna_tipo_evento, 'NORMAL', 'LUCRO',
            v_payout_real, v_perna.moeda,
            'payout_' || v_aposta.id::TEXT || '_perna_' || v_perna.id::TEXT || '_' || p_resultado,
            format('Payout %s perna %s real: %s (odd=%s)', p_resultado, v_perna.ordem, v_payout_real, v_perna.odd),
            now(), auth.uid()
          ) ON CONFLICT DO NOTHING
          RETURNING id INTO v_event_id;
          IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
        END IF;
      END IF;

      -- ===== PAYOUT FREEBET (lucro vai para saldo NORMAL) =====
      IF v_payout_freebet > 0 THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_perna.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
          'FREEBET_PAYOUT', 'NORMAL', 'LUCRO',
          v_payout_freebet, v_perna.moeda,
          'payout_fb_' || v_aposta.id::TEXT || '_perna_' || v_perna.id::TEXT || '_' || p_resultado,
          format('Payout freebet %s perna %s: %s (odd=%s)', p_resultado, v_perna.ordem, v_payout_freebet, v_perna.odd),
          now(), auth.uid()
        ) ON CONFLICT DO NOTHING
        RETURNING id INTO v_event_id;
        IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
      END IF;

      -- Propagar resultado para a perna
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
    -- ============== SINGLE-ENTRY (idêntico ao original) ==============
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
          v_payout := p_lucro_prejuizo; v_tipo_evento := 'FREEBET_PAYOUT';
        ELSE
          v_payout := 0; v_tipo_evento := NULL;
        END IF;
      ELSE
        v_payout := v_aposta.stake + p_lucro_prejuizo;
        IF v_payout <= 0 THEN
          v_payout := 0; v_tipo_evento := NULL;
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
            v_payout := v_aposta.stake * (v_odd - 1); v_tipo_evento := 'FREEBET_PAYOUT';
          ELSE
            v_payout := v_aposta.stake * v_odd; v_tipo_evento := 'PAYOUT';
          END IF;
        WHEN 'RED' THEN v_payout := 0; v_tipo_evento := NULL;
        WHEN 'VOID' THEN v_payout := v_aposta.stake; v_tipo_evento := 'VOID_REFUND';
        WHEN 'MEIO_GREEN' THEN
          IF v_is_freebet_aposta THEN
            v_payout := v_aposta.stake * (v_odd - 1) / 2; v_tipo_evento := 'FREEBET_PAYOUT';
          ELSE
            v_payout := v_aposta.stake + (v_aposta.stake * (v_odd - 1) / 2); v_tipo_evento := 'PAYOUT';
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
        format('Payout %s: %s (odd=%s)', p_resultado, v_payout, v_odd),
        now(), auth.uid()
      ) ON CONFLICT DO NOTHING
      RETURNING id INTO v_event_id;
      IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
    END IF;
  END IF;

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
    updated_at = now()
  WHERE id = p_aposta_id;

  RETURN QUERY SELECT TRUE, v_events_count, format('Liquidação concluída: %s (%s pernas)', p_resultado, CASE WHEN v_has_pernas THEN v_perna_count ELSE 1 END)::TEXT;
END;
$function$;


-- 2) reliquidar_aposta_v6 com split correto e idempotência consistente
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
  v_novo_lucro_consolidado NUMERIC := 0;
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
  v_stake_real NUMERIC;
  v_stake_freebet NUMERIC;
  v_stake_event_exists BOOLEAN;
  v_proj RECORD;
  v_moedas_distintas INT := 0;
  v_is_multicurrency BOOLEAN := FALSE;
  v_perna_lucro_consolidado NUMERIC;
  v_rate_perna NUMERIC;
  v_rate_consol NUMERIC;
  v_diferenca_real NUMERIC;
  v_diferenca_freebet NUMERIC;
BEGIN
  SELECT
    au.id, au.resultado, au.lucro_prejuizo, au.stake,
    au.odd, au.odd_final, au.bookmaker_id, au.workspace_id, au.user_id,
    au.projeto_id,
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

  SELECT
    COALESCE(moeda_consolidacao, 'BRL') as moeda_consolidacao,
    COALESCE(cotacao_trabalho, 1) as r_usd,
    COALESCE(cotacao_trabalho_eur, 1) as r_eur,
    COALESCE(cotacao_trabalho_gbp, 1) as r_gbp,
    COALESCE(cotacao_trabalho_myr, 1) as r_myr,
    COALESCE(cotacao_trabalho_mxn, 1) as r_mxn,
    COALESCE(cotacao_trabalho_ars, 1) as r_ars,
    COALESCE(cotacao_trabalho_cop, 1) as r_cop
  INTO v_proj
  FROM projetos
  WHERE id = v_aposta.projeto_id;

  SELECT COUNT(*) INTO v_perna_count FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  v_has_pernas := v_perna_count > 0;

  IF v_has_pernas THEN
    SELECT COUNT(DISTINCT moeda) INTO v_moedas_distintas FROM apostas_pernas WHERE aposta_id = p_aposta_id;
    v_is_multicurrency := v_moedas_distintas > 1
      OR EXISTS(SELECT 1 FROM apostas_pernas WHERE aposta_id = p_aposta_id AND moeda <> v_proj.moeda_consolidacao);

    v_rate_consol := CASE v_proj.moeda_consolidacao
      WHEN 'BRL' THEN 1 WHEN 'USD' THEN v_proj.r_usd WHEN 'EUR' THEN v_proj.r_eur
      WHEN 'GBP' THEN v_proj.r_gbp WHEN 'MYR' THEN v_proj.r_myr WHEN 'MXN' THEN v_proj.r_mxn
      WHEN 'ARS' THEN v_proj.r_ars WHEN 'COP' THEN v_proj.r_cop ELSE 1
    END;
    IF v_rate_consol = 0 THEN v_rate_consol := 1; END IF;

    FOR v_perna IN
      SELECT * FROM apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
    LOOP
      v_odd := COALESCE(v_perna.odd, 1);
      v_stake := COALESCE(v_perna.stake, 0);
      v_stake_freebet := COALESCE(v_perna.stake_freebet, 0);
      v_stake_real := COALESCE(v_perna.stake_real, GREATEST(v_stake - v_stake_freebet, 0));
      
      -- Fallback se ambos zero
      IF v_stake_real = 0 AND v_stake_freebet = 0 THEN
        IF COALESCE(v_perna.fonte_saldo,'REAL') = 'FREEBET' THEN
          v_stake_freebet := v_stake;
        ELSE
          v_stake_real := v_stake;
        END IF;
      END IF;

      -- Backfill STAKE NORMAL se faltante
      IF v_perna.bookmaker_id IS NOT NULL AND v_stake_real > 0 THEN
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
            'STAKE', 'NORMAL', -v_stake_real, v_perna.moeda,
            'stake_' || p_aposta_id::TEXT || '_perna_' || v_perna.id::TEXT,
            format('Backfill stake real perna %s', v_perna.ordem),
            now(), auth.uid()
          ) ON CONFLICT DO NOTHING;
        END IF;
      END IF;

      -- Backfill STAKE FREEBET se faltante
      IF v_perna.bookmaker_id IS NOT NULL AND v_stake_freebet > 0 THEN
        SELECT EXISTS(
          SELECT 1 FROM financial_events
          WHERE aposta_id = p_aposta_id
            AND idempotency_key = 'stake_fb_' || p_aposta_id::TEXT || '_perna_' || v_perna.id::TEXT
        ) INTO v_stake_event_exists;

        IF NOT v_stake_event_exists THEN
          INSERT INTO financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            valor, moeda, idempotency_key, descricao, processed_at, created_by
          ) VALUES (
            v_perna.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
            'FREEBET_STAKE', 'FREEBET', -v_stake_freebet, v_perna.moeda,
            'stake_fb_' || p_aposta_id::TEXT || '_perna_' || v_perna.id::TEXT,
            format('Backfill stake freebet perna %s', v_perna.ordem),
            now(), auth.uid()
          ) ON CONFLICT DO NOTHING;
        END IF;
      END IF;

      -- Diferenças por componente
      IF v_resultado_anterior IS DISTINCT FROM p_novo_resultado THEN
        -- Impacto REAL anterior e novo
        v_diferenca_real := (
          CASE p_novo_resultado
            WHEN 'GREEN' THEN v_stake_real * (v_odd - 1)
            WHEN 'MEIO_GREEN' THEN v_stake_real * (v_odd - 1) / 2
            WHEN 'VOID' THEN 0
            WHEN 'MEIO_RED' THEN -v_stake_real / 2
            WHEN 'RED' THEN -v_stake_real
            ELSE -v_stake_real
          END
        ) - (
          CASE COALESCE(v_resultado_anterior, 'NULL')
            WHEN 'GREEN' THEN v_stake_real * (v_odd - 1)
            WHEN 'MEIO_GREEN' THEN v_stake_real * (v_odd - 1) / 2
            WHEN 'VOID' THEN 0
            WHEN 'MEIO_RED' THEN -v_stake_real / 2
            WHEN 'RED' THEN -v_stake_real
            ELSE -v_stake_real
          END
        );

        -- Impacto FREEBET (sempre não-negativo: SNR)
        v_diferenca_freebet := (
          CASE p_novo_resultado
            WHEN 'GREEN' THEN v_stake_freebet * (v_odd - 1)
            WHEN 'MEIO_GREEN' THEN v_stake_freebet * (v_odd - 1) / 2
            ELSE 0
          END
        ) - (
          CASE COALESCE(v_resultado_anterior, 'NULL')
            WHEN 'GREEN' THEN v_stake_freebet * (v_odd - 1)
            WHEN 'MEIO_GREEN' THEN v_stake_freebet * (v_odd - 1) / 2
            ELSE 0
          END
        );

        v_impacto_novo := (
          CASE p_novo_resultado
            WHEN 'GREEN' THEN v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)
            WHEN 'MEIO_GREEN' THEN (v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)) / 2
            WHEN 'VOID' THEN 0
            WHEN 'MEIO_RED' THEN -v_stake_real / 2
            WHEN 'RED' THEN -v_stake_real
            ELSE -v_stake_real
          END
        );

        UPDATE apostas_pernas
        SET resultado = p_novo_resultado, lucro_prejuizo = v_impacto_novo, updated_at = now()
        WHERE id = v_perna.id;

        -- AJUSTE NORMAL (parte real)
        IF v_perna.bookmaker_id IS NOT NULL AND v_diferenca_real <> 0 THEN
          v_idempotency_key := 'reliq_perna_' || v_perna.id::TEXT || '_real_' ||
                               COALESCE(v_resultado_anterior, 'NULL') || '_to_' || p_novo_resultado;
          SELECT id INTO v_evento_existente FROM financial_events WHERE idempotency_key = v_idempotency_key;
          IF v_evento_existente IS NULL THEN
            INSERT INTO financial_events (
              bookmaker_id, aposta_id, tipo_evento, tipo_uso,
              valor, moeda, workspace_id, idempotency_key, created_by, processed_at, descricao
            ) VALUES (
              v_perna.bookmaker_id, p_aposta_id, 'AJUSTE', 'NORMAL',
              v_diferenca_real, v_perna.moeda, v_aposta.workspace_id, v_idempotency_key, auth.uid(), now(),
              format('Reliq perna %s real (%s -> %s) [real=%s]',
                     v_perna.ordem, COALESCE(v_resultado_anterior,'NULL'), p_novo_resultado, v_stake_real)
            );
          END IF;
        END IF;

        -- AJUSTE FREEBET PAYOUT (parte freebet — sempre vai para NORMAL como lucro)
        IF v_perna.bookmaker_id IS NOT NULL AND v_diferenca_freebet <> 0 THEN
          v_idempotency_key := 'reliq_perna_' || v_perna.id::TEXT || '_fb_' ||
                               COALESCE(v_resultado_anterior, 'NULL') || '_to_' || p_novo_resultado;
          SELECT id INTO v_evento_existente FROM financial_events WHERE idempotency_key = v_idempotency_key;
          IF v_evento_existente IS NULL THEN
            INSERT INTO financial_events (
              bookmaker_id, aposta_id, tipo_evento, tipo_uso,
              valor, moeda, workspace_id, idempotency_key, created_by, processed_at, descricao
            ) VALUES (
              v_perna.bookmaker_id, p_aposta_id, 'AJUSTE', 'NORMAL',
              v_diferenca_freebet, v_perna.moeda, v_aposta.workspace_id, v_idempotency_key, auth.uid(), now(),
              format('Reliq perna %s freebet (%s -> %s) [fb=%s]',
                     v_perna.ordem, COALESCE(v_resultado_anterior,'NULL'), p_novo_resultado, v_stake_freebet)
            );
          END IF;
        END IF;
      ELSE
        v_impacto_novo := COALESCE(v_perna.lucro_prejuizo, 0);
      END IF;

      v_rate_perna := CASE v_perna.moeda
        WHEN 'BRL' THEN 1 WHEN 'USD' THEN v_proj.r_usd WHEN 'EUR' THEN v_proj.r_eur
        WHEN 'GBP' THEN v_proj.r_gbp WHEN 'MYR' THEN v_proj.r_myr WHEN 'MXN' THEN v_proj.r_mxn
        WHEN 'ARS' THEN v_proj.r_ars WHEN 'COP' THEN v_proj.r_cop ELSE 1
      END;
      IF v_rate_perna = 0 THEN v_rate_perna := 1; END IF;

      v_perna_lucro_consolidado := (v_impacto_novo * v_rate_perna) / v_rate_consol;
      v_novo_lucro := v_novo_lucro + v_impacto_novo;
      v_novo_lucro_consolidado := v_novo_lucro_consolidado + v_perna_lucro_consolidado;
    END LOOP;

    UPDATE apostas_unificada
    SET resultado = p_novo_resultado, status = 'LIQUIDADA',
        lucro_prejuizo = CASE WHEN v_is_multicurrency THEN v_novo_lucro_consolidado ELSE v_novo_lucro END,
        pl_consolidado = v_novo_lucro_consolidado,
        consolidation_currency = v_proj.moeda_consolidacao,
        is_multicurrency = v_is_multicurrency,
        moeda_operacao = CASE WHEN v_is_multicurrency THEN 'MULTI' ELSE moeda_operacao END,
        updated_at = now()
    WHERE id = p_aposta_id;

    RETURN jsonb_build_object(
      'success', true, 'multi_entry', true, 'multi_currency', v_is_multicurrency,
      'consolidation_currency', v_proj.moeda_consolidacao,
      'pernas_processadas', v_perna_count,
      'resultado_anterior', v_resultado_anterior, 'resultado_novo', p_novo_resultado,
      'lucro_prejuizo', CASE WHEN v_is_multicurrency THEN v_novo_lucro_consolidado ELSE v_novo_lucro END,
      'pl_consolidado', v_novo_lucro_consolidado, 'lucro_nominal_soma', v_novo_lucro
    );
  END IF;

  -- SINGLE-ENTRY (mantido)
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
  v_novo_lucro := COALESCE(p_lucro_prejuizo, v_impacto_novo);
  v_idempotency_key := 'reliq_' || p_aposta_id::TEXT || '_' || COALESCE(v_resultado_anterior,'NULL') || '_to_' || p_novo_resultado;

  IF v_bookmaker_id IS NOT NULL AND v_diferenca <> 0 THEN
    SELECT id INTO v_evento_existente FROM financial_events WHERE idempotency_key = v_idempotency_key;
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
  SET resultado = p_novo_resultado, status = 'LIQUIDADA',
      lucro_prejuizo = v_novo_lucro, updated_at = now()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object('success', true, 'multi_entry', false,
    'resultado_anterior', v_resultado_anterior, 'resultado_novo', p_novo_resultado,
    'diferenca', v_diferenca, 'lucro_prejuizo', v_novo_lucro);
END;
$function$;


-- 3) Healing da aposta 40f72073: a perna 0 tem stake_real=100 + stake_freebet=50,
--    mas só tem STAKE NORMAL -100 no ledger. O stake_freebet=50 nunca foi debitado.
--    Como ainda está PENDENTE, criar o STAKE FREEBET faltante.
DO $$
DECLARE
  v_perna_id UUID := 'e88f7142-9ea6-471d-a83d-d0c89122100f';
  v_aposta_id UUID := '40f72073-93f9-4d72-8d1a-251e1ea9aae0';
  v_bookmaker_id UUID := '29628346-7d98-4ba0-a2c8-d61a7ab5d7a7';
  v_workspace_id UUID;
  v_idem TEXT;
  v_exists BOOLEAN;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM apostas_unificada WHERE id = v_aposta_id;
  v_idem := 'stake_fb_' || v_aposta_id::TEXT || '_perna_' || v_perna_id::TEXT;

  SELECT EXISTS(SELECT 1 FROM financial_events WHERE idempotency_key = v_idem) INTO v_exists;
  IF NOT v_exists THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, descricao, processed_at
    ) VALUES (
      v_bookmaker_id, v_aposta_id, v_workspace_id,
      'FREEBET_STAKE', 'FREEBET', -50, 'USD',
      v_idem, 'Healing: stake freebet perna 0 faltante (split misto)', now()
    );
  END IF;
END $$;
