
-- ============================================================
-- Causa A + B: precisão de PAYOUT e guarda de re-liquidação
-- ============================================================

-- (A) liquidar_aposta_v4: normaliza PAYOUT e lucro com ROUND por moeda
CREATE OR REPLACE FUNCTION public.liquidar_aposta_v4(p_aposta_id uuid, p_resultado text, p_lucro_prejuizo numeric DEFAULT NULL::numeric)
 RETURNS TABLE(success boolean, events_created integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_aposta RECORD;
    v_perna RECORD;
    v_events_count INTEGER := 0;
    v_payout_total NUMERIC := 0;
    v_has_pernas BOOLEAN := FALSE;
    v_effective_odd NUMERIC;
    v_metadata JSONB;
    v_moeda_casa TEXT;
    v_moeda_op TEXT;
    v_precisao INTEGER;
    v_is_lay BOOLEAN := FALSE;
    v_lay_comissao NUMERIC;
    v_lucro_calc NUMERIC;
BEGIN
    SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
    IF v_aposta.id IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT;
        RETURN;
    END IF;

    SELECT moeda INTO v_moeda_casa FROM public.bookmakers WHERE id = v_aposta.bookmaker_id;

    IF v_aposta.status = 'LIQUIDADA' THEN
        RETURN QUERY SELECT FALSE, 0, 'Aposta já está liquidada'::TEXT;
        RETURN;
    END IF;

    v_moeda_op := UPPER(COALESCE(v_aposta.moeda_operacao, v_moeda_casa, 'BRL'));
    v_precisao := CASE WHEN v_moeda_op IN ('BTC','ETH','USDT','USDC','BNB','TRX','SOL','MATIC','ADA','DOT','AVAX','LINK','UNI','LTC','XRP') THEN 8 ELSE 2 END;

    FOR v_perna IN SELECT * FROM public.apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
    LOOP
        v_has_pernas := TRUE;
    END LOOP;

    IF NOT v_has_pernas THEN
        v_effective_odd := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);

        IF COALESCE(v_aposta.boost_percentual, 0) > 0 THEN
            v_effective_odd := v_effective_odd * (1 + (v_aposta.boost_percentual / 100.0));
        END IF;

        v_is_lay := (
            v_aposta.modo_entrada = 'EXCHANGE'
            AND v_aposta.lay_liability IS NOT NULL
            AND v_aposta.lay_liability > 0
        );

        IF v_is_lay AND p_resultado IN ('GREEN', 'RED', 'VOID', 'CANCELADA') THEN
            v_lay_comissao := GREATEST(0, LEAST(1, COALESCE(v_aposta.lay_comissao, 0)));

            CASE p_resultado
                WHEN 'GREEN' THEN
                    v_payout_total := v_aposta.lay_liability + (v_aposta.stake * (1 - v_lay_comissao));
                    v_lucro_calc   := v_aposta.stake * (1 - v_lay_comissao);
                WHEN 'RED' THEN
                    v_payout_total := 0;
                    v_lucro_calc   := -v_aposta.lay_liability;
                WHEN 'VOID', 'CANCELADA' THEN
                    v_payout_total := v_aposta.lay_liability;
                    v_lucro_calc   := 0;
            END CASE;

            -- Causa A: normalização anti-drift
            v_payout_total := ROUND(v_payout_total::numeric, v_precisao);
            v_lucro_calc   := ROUND(v_lucro_calc::numeric,   v_precisao);

            IF v_payout_total > 0 THEN
                v_metadata := jsonb_build_object(
                    'evento', 'liquidacao_lay_fallback',
                    'aposta_id', p_aposta_id, 'tipo', 'LAY',
                    'modo_entrada', v_aposta.modo_entrada,
                    'stake', v_aposta.stake, 'lay_odd', v_aposta.lay_odd,
                    'lay_liability', v_aposta.lay_liability,
                    'lay_comissao', v_lay_comissao, 'resultado', p_resultado,
                    'payout_bruto', v_payout_total, 'lucro_liquido', v_lucro_calc,
                    'moeda_casa', v_moeda_casa, 'precisao_aplicada', v_precisao
                );

                INSERT INTO public.financial_events (
                    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                    valor, moeda, idempotency_key, descricao, processed_at, metadata
                ) VALUES (
                    v_aposta.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    'PAYOUT', 'NORMAL',
                    v_payout_total, COALESCE(v_aposta.moeda_operacao, v_moeda_casa, 'BRL'),
                    'payout_lay_' || p_aposta_id,
                    format('Retorno LAY (%s) | Stake: %s | Liability: %s | Com: %s',
                           p_resultado, v_aposta.stake, v_aposta.lay_liability, v_lay_comissao),
                    NOW(), v_metadata
                ) ON CONFLICT (idempotency_key) DO NOTHING;
                IF FOUND THEN v_events_count := v_events_count + 1; END IF;
            END IF;

        ELSIF p_resultado IN ('GREEN', 'MEIO_GREEN', 'VOID', 'MEIO_RED', 'RED', 'CANCELADA') THEN
            CASE p_resultado
                WHEN 'GREEN' THEN v_payout_total := v_aposta.stake * v_effective_odd;
                WHEN 'MEIO_GREEN' THEN v_payout_total := v_aposta.stake + (v_aposta.stake * (v_effective_odd - 1) / 2);
                WHEN 'VOID', 'CANCELADA' THEN v_payout_total := v_aposta.stake;
                WHEN 'MEIO_RED' THEN v_payout_total := v_aposta.stake / 2;
                ELSE v_payout_total := 0;
            END CASE;

            v_lucro_calc := v_payout_total - v_aposta.stake;

            -- Causa A: normalização anti-drift
            v_payout_total := ROUND(v_payout_total::numeric, v_precisao);
            v_lucro_calc   := ROUND(v_lucro_calc::numeric,   v_precisao);

            IF v_payout_total > 0 THEN
                v_metadata := jsonb_build_object(
                    'evento', 'liquidacao_multipla_fallback',
                    'aposta_id', p_aposta_id, 'tipo', v_aposta.forma_registro,
                    'stake', v_aposta.stake, 'odd_final', v_effective_odd,
                    'resultado', p_resultado, 'payout_calculado', v_payout_total,
                    'lucro_calculado', v_lucro_calc,
                    'boost_percentual', v_aposta.boost_percentual,
                    'moeda_casa', v_moeda_casa, 'precisao_aplicada', v_precisao,
                    'sinal_correto', (v_lucro_calc >= 0 OR p_resultado = 'RED')
                );

                INSERT INTO public.financial_events (
                    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                    valor, moeda, idempotency_key, descricao, processed_at, metadata
                ) VALUES (
                    v_aposta.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    'PAYOUT', 'NORMAL',
                    v_payout_total, COALESCE(v_aposta.moeda_operacao, v_moeda_casa, 'BRL'),
                    'payout_simple_' || p_aposta_id,
                    format('Retorno Aposta %s (%s) | Stake: %s | Odd: %s', v_aposta.forma_registro, p_resultado, v_aposta.stake, v_effective_odd),
                    NOW(), v_metadata
                ) ON CONFLICT (idempotency_key) DO NOTHING;
                IF FOUND THEN v_events_count := v_events_count + 1; END IF;
            END IF;
        END IF;
    END IF;

    UPDATE public.apostas_unificada
    SET status = 'LIQUIDADA',
        resultado = p_resultado,
        lucro_prejuizo = ROUND(COALESCE(p_lucro_prejuizo, v_lucro_calc)::numeric, v_precisao),
        valor_retorno = ROUND(v_payout_total::numeric, v_precisao),
        updated_at = NOW()
    WHERE id = p_aposta_id;

    PERFORM public.sync_bookmaker_balance_from_ledger(v_aposta.bookmaker_id);

    RETURN QUERY SELECT TRUE, v_events_count, 'Aposta liquidada com sucesso'::TEXT;
END;
$function$;


-- (A) liquidar_perna_surebet_v1: ROUND nos inserts de PAYOUT/VOID_REFUND
CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(p_perna_id uuid, p_resultado text, p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_surebet_id UUID;
  v_old_resultado TEXT;
  v_entry RECORD;
  v_payout NUMERIC := 0;
  v_refund NUMERIC := 0;
  v_is_fb BOOLEAN;
  v_is_lay BOOLEAN;
  v_comissao NUMERIC;
  v_liability NUMERIC;
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC;
  v_stake_total NUMERIC;
  v_resultado_final TEXT;
  v_is_multicurrency BOOLEAN;
  v_pl_consolidado NUMERIC;
  v_stake_consolidado NUMERIC;
  v_consol_currency TEXT;
  v_events_count INTEGER := 0;
  v_has_entries BOOLEAN := false;
  v_perna_lógica RECORD;
  v_perna_lucro_acumulado NUMERIC := 0;
  v_ts_suffix TEXT := extract(epoch from clock_timestamp())::bigint::text;
  v_now TIMESTAMP WITH TIME ZONE := clock_timestamp();
  v_precisao INTEGER;
  v_moeda_norm TEXT;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT ap.aposta_id, ap.resultado, ap.bookmaker_id, ap.stake, ap.odd, ap.moeda,
         COALESCE(ap.fonte_saldo,'REAL') AS fonte_saldo,
         COALESCE(ap.tipo,'back')        AS tipo,
         COALESCE(ap.comissao, 0)        AS comissao
    INTO v_perna_lógica
  FROM public.apostas_pernas ap
  WHERE ap.id = p_perna_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;

  v_surebet_id := v_perna_lógica.aposta_id;
  v_old_resultado := v_perna_lógica.resultado;

  PERFORM 1 FROM public.apostas_unificada au WHERE au.id = v_surebet_id FOR UPDATE;

  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    origem, valor, moeda, idempotency_key, reversed_event_id, descricao, created_by
  )
  SELECT
    fe.bookmaker_id, fe.aposta_id, fe.workspace_id, 'REVERSAL', fe.tipo_uso,
    'liquidation_reset', -fe.valor, fe.moeda,
    'rev_' || fe.id || '_' || v_ts_suffix,
    fe.id, 'Estorno para re-liquidação (Perna Composta)', auth.uid()
  FROM public.financial_events fe
  WHERE fe.aposta_id = v_surebet_id
    AND fe.tipo_evento IN ('PAYOUT','VOID_REFUND','FREEBET_PAYOUT')
    AND fe.created_at < v_now
    AND fe.idempotency_key LIKE '%perna_' || p_perna_id || '%'
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_events r
      WHERE r.tipo_evento = 'REVERSAL' AND r.reversed_event_id = fe.id
    )
  ON CONFLICT (idempotency_key) DO NOTHING;

  UPDATE public.apostas_pernas SET
    resultado = CASE WHEN p_resultado = 'PENDENTE' THEN NULL ELSE p_resultado END,
    updated_at = NOW()
  WHERE id = p_perna_id;

  SELECT EXISTS(SELECT 1 FROM public.apostas_perna_entradas WHERE perna_id = p_perna_id) INTO v_has_entries;

  IF p_resultado != 'PENDENTE' AND p_resultado IS NOT NULL THEN
    IF v_has_entries THEN
      FOR v_entry IN
        SELECT ae.id, ae.bookmaker_id, ae.stake, ae.odd, ae.moeda,
               COALESCE(ae.fonte_saldo,'REAL') AS fonte_saldo,
               COALESCE(ae.tipo, v_perna_lógica.tipo, 'back') AS tipo,
               COALESCE(ae.comissao, v_perna_lógica.comissao, 0) AS comissao,
               bk.nome AS bk_nome
        FROM public.apostas_perna_entradas ae
        JOIN public.bookmakers bk ON bk.id = ae.bookmaker_id
        WHERE ae.perna_id = p_perna_id
      LOOP
        v_is_fb := (v_entry.fonte_saldo = 'FREEBET');
        v_is_lay := (v_entry.tipo = 'lay');
        v_comissao := v_entry.comissao;
        v_liability := v_entry.stake * GREATEST(v_entry.odd - 1, 0);
        v_payout := 0;
        v_refund := 0;

        IF v_is_lay THEN
          IF p_resultado = 'GREEN' THEN
            v_payout := v_entry.stake * (1 - v_comissao);
            v_refund := v_liability;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado + v_entry.stake * (1 - v_comissao);
          ELSIF p_resultado = 'MEIO_GREEN' THEN
            v_payout := (v_entry.stake / 2) * (1 - v_comissao);
            v_refund := v_liability;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado + (v_entry.stake / 2) * (1 - v_comissao);
          ELSIF p_resultado = 'MEIO_RED' THEN
            v_refund := v_liability / 2;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado - (v_liability / 2);
          ELSIF p_resultado = 'RED' THEN
            v_perna_lucro_acumulado := v_perna_lucro_acumulado - v_liability;
          ELSIF p_resultado = 'VOID' THEN
            v_refund := v_liability;
          END IF;
        ELSE
          IF p_resultado = 'GREEN' THEN
            v_payout := CASE WHEN v_is_fb THEN v_entry.stake * (v_entry.odd - 1) ELSE v_entry.stake * v_entry.odd END;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado + (v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END));
          ELSIF p_resultado = 'MEIO_GREEN' THEN
            v_payout := CASE
              WHEN v_is_fb THEN (v_entry.stake * (v_entry.odd - 1)) / 2
              ELSE (v_entry.stake / 2) + ((v_entry.stake / 2) * v_entry.odd)
            END;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado + (v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END));
          ELSIF p_resultado = 'MEIO_RED' THEN
            v_refund := v_entry.stake / 2;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado - (CASE WHEN v_is_fb THEN 0 ELSE (v_entry.stake / 2) END);
          ELSIF p_resultado = 'RED' THEN
            v_perna_lucro_acumulado := v_perna_lucro_acumulado - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END);
          ELSIF p_resultado = 'VOID' THEN
            v_refund := v_entry.stake;
          END IF;
        END IF;

        v_moeda_norm := UPPER(COALESCE(v_entry.moeda, 'BRL'));
        v_precisao := CASE WHEN v_moeda_norm IN ('BTC','ETH','USDT','USDC','BNB','TRX','SOL','MATIC','ADA','DOT','AVAX','LINK','UNI','LTC','XRP') THEN 8 ELSE 2 END;
        v_payout := ROUND(v_payout::numeric, v_precisao);
        v_refund := ROUND(v_refund::numeric, v_precisao);

        IF v_payout > 0 THEN
          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id,
            CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
            CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET' ELSE 'NORMAL' END,
            'LUCRO', v_payout, v_entry.moeda,
            'payout_perna_' || p_perna_id || '_ent_' || v_entry.id || '_' || v_ts_suffix,
            format('Payout %s Perna Composta %s (%s)', p_resultado, v_entry.tipo, v_entry.bk_nome),
            auth.uid()
          ) ON CONFLICT (idempotency_key) DO NOTHING;
          v_events_count := v_events_count + 1;
        END IF;

        IF v_refund > 0 THEN
          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
            CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET' ELSE 'NORMAL' END,
            'ESTORNO', v_refund, v_entry.moeda,
            'voidrefund_perna_' || p_perna_id || '_ent_' || v_entry.id || '_' || v_ts_suffix,
            format('Reembolso %s Perna Composta %s (%s)', p_resultado, v_entry.tipo, v_entry.bk_nome),
            auth.uid()
          ) ON CONFLICT (idempotency_key) DO NOTHING;
          v_events_count := v_events_count + 1;
        END IF;
      END LOOP;
    ELSE
      v_is_fb := (v_perna_lógica.fonte_saldo = 'FREEBET');
      v_is_lay := (v_perna_lógica.tipo = 'lay');
      v_comissao := v_perna_lógica.comissao;
      v_liability := v_perna_lógica.stake * GREATEST(v_perna_lógica.odd - 1, 0);
      v_payout := 0;
      v_refund := 0;

      IF v_is_lay THEN
        IF p_resultado = 'GREEN' THEN
          v_payout := v_perna_lógica.stake * (1 - v_comissao);
          v_refund := v_liability;
          v_perna_lucro_acumulado := v_perna_lógica.stake * (1 - v_comissao);
        ELSIF p_resultado = 'MEIO_GREEN' THEN
          v_payout := (v_perna_lógica.stake / 2) * (1 - v_comissao);
          v_refund := v_liability;
          v_perna_lucro_acumulado := (v_perna_lógica.stake / 2) * (1 - v_comissao);
        ELSIF p_resultado = 'MEIO_RED' THEN
          v_refund := v_liability / 2;
          v_perna_lucro_acumulado := -(v_liability / 2);
        ELSIF p_resultado = 'RED' THEN
          v_perna_lucro_acumulado := -v_liability;
        ELSIF p_resultado = 'VOID' THEN
          v_refund := v_liability;
          v_perna_lucro_acumulado := 0;
        END IF;
      ELSE
        IF p_resultado = 'GREEN' THEN
          v_payout := CASE WHEN v_is_fb THEN v_perna_lógica.stake * (v_perna_lógica.odd - 1) ELSE v_perna_lógica.stake * v_perna_lógica.odd END;
          v_perna_lucro_acumulado := v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_perna_lógica.stake END);
        ELSIF p_resultado = 'MEIO_GREEN' THEN
          v_payout := CASE
            WHEN v_is_fb THEN (v_perna_lógica.stake * (v_perna_lógica.odd - 1)) / 2
            ELSE (v_perna_lógica.stake / 2) + ((v_perna_lógica.stake / 2) * v_perna_lógica.odd)
          END;
          v_perna_lucro_acumulado := v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_perna_lógica.stake END);
        ELSIF p_resultado = 'MEIO_RED' THEN
          v_refund := v_perna_lógica.stake / 2;
          v_perna_lucro_acumulado := -(CASE WHEN v_is_fb THEN 0 ELSE (v_perna_lógica.stake / 2) END);
        ELSIF p_resultado = 'RED' THEN
          v_perna_lucro_acumulado := -(CASE WHEN v_is_fb THEN 0 ELSE v_perna_lógica.stake END);
        ELSIF p_resultado = 'VOID' THEN
          v_refund := v_perna_lógica.stake;
          v_perna_lucro_acumulado := 0;
        END IF;
      END IF;

      v_moeda_norm := UPPER(COALESCE(v_perna_lógica.moeda, 'BRL'));
      v_precisao := CASE WHEN v_moeda_norm IN ('BTC','ETH','USDT','USDC','BNB','TRX','SOL','MATIC','ADA','DOT','AVAX','LINK','UNI','LTC','XRP') THEN 8 ELSE 2 END;
      v_payout := ROUND(v_payout::numeric, v_precisao);
      v_refund := ROUND(v_refund::numeric, v_precisao);

      IF v_payout > 0 THEN
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, created_by
        ) VALUES (
          v_perna_lógica.bookmaker_id, v_surebet_id, p_workspace_id,
          CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
          CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET' ELSE 'NORMAL' END,
          'LUCRO', v_payout, v_perna_lógica.moeda,
          'payout_perna_' || p_perna_id || '_' || v_ts_suffix,
          format('Payout %s Perna Simples %s', p_resultado, v_perna_lógica.tipo),
          auth.uid()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
        v_events_count := v_events_count + 1;
      END IF;

      IF v_refund > 0 THEN
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, created_by
        ) VALUES (
          v_perna_lógica.bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
          CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET' ELSE 'NORMAL' END,
          'ESTORNO', v_refund, v_perna_lógica.moeda,
          'voidrefund_perna_' || p_perna_id || '_' || v_ts_suffix,
          format('Reembolso %s Perna Simples %s', p_resultado, v_perna_lógica.tipo),
          auth.uid()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
        v_events_count := v_events_count + 1;
      END IF;
    END IF;
  END IF;

  UPDATE public.apostas_pernas SET lucro_prejuizo = v_perna_lucro_acumulado WHERE id = p_perna_id;

  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency, r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
    INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency, v_pl_consolidado, v_stake_consolidado, v_consol_currency
  FROM fn_recalc_pai_surebet(v_surebet_id) r;

  UPDATE public.apostas_unificada SET
    status = CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PARCIAL' END,
    resultado = CASE WHEN v_todas_liquidadas THEN v_resultado_final ELSE 'PENDENTE' END,
    lucro_prejuizo = v_lucro_total,
    stake = v_stake_total,
    is_multicurrency = v_is_multicurrency,
    pl_consolidado = v_pl_consolidado,
    stake_consolidado = v_stake_consolidado,
    consolidation_currency = v_consol_currency,
    updated_at = NOW()
  WHERE id = v_surebet_id;

  PERFORM public.sync_bookmaker_balance_from_ledger(v_perna_lógica.bookmaker_id);

  RETURN jsonb_build_object('success', true, 'events_created', v_events_count);
END;
$function$;


-- (B) reliquidar_aposta_v6: adiciona guarda anti-saldo-negativo
CREATE OR REPLACE FUNCTION public.reliquidar_aposta_v6(p_aposta_id uuid, p_novo_resultado text, p_lucro_prejuizo numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_aposta RECORD;
    v_eventos_antigos JSONB;
    v_eventos_count INTEGER;
    v_actor UUID;
    v_saldo_pos NUMERIC;
BEGIN
    SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
    END IF;

    SELECT
      COALESCE(jsonb_agg(to_jsonb(fe.*) ORDER BY fe.processed_at), '[]'::jsonb),
      COUNT(*)
    INTO v_eventos_antigos, v_eventos_count
    FROM public.financial_events fe
    WHERE fe.aposta_id = p_aposta_id
      AND fe.tipo_evento IN ('PAYOUT', 'FREEBET_RETURN', 'VOID_REFUND', 'AJUSTE', 'REVERSAL');

    v_actor := COALESCE(auth.uid(), v_aposta.user_id);

    IF v_eventos_count > 0 OR v_aposta.resultado IS NOT NULL THEN
        INSERT INTO public.audit_logs (
            workspace_id, actor_user_id, action, entity_type, entity_id,
            before_data, after_data, metadata
        ) VALUES (
            v_aposta.workspace_id, v_actor, 'UPDATE'::audit_action,
            'aposta_reliquidacao', p_aposta_id,
            jsonb_build_object(
                'resultado_anterior', v_aposta.resultado,
                'status_anterior',    v_aposta.status,
                'lucro_prejuizo_anterior', v_aposta.lucro_prejuizo,
                'valor_retorno_anterior', v_aposta.valor_retorno,
                'eventos_financeiros_estornados', v_eventos_antigos
            ),
            jsonb_build_object(
                'resultado_novo', p_novo_resultado,
                'lucro_prejuizo_informado', p_lucro_prejuizo
            ),
            jsonb_build_object(
                'evento', 'reliquidacao_aposta',
                'bookmaker_id', v_aposta.bookmaker_id,
                'forma_registro', v_aposta.forma_registro,
                'eventos_estornados_count', v_eventos_count,
                'reliquidado_em', now()
            )
        );
    END IF;

    DELETE FROM public.financial_events
    WHERE aposta_id = p_aposta_id
      AND tipo_evento IN ('PAYOUT', 'FREEBET_RETURN', 'VOID_REFUND', 'AJUSTE', 'REVERSAL');

    UPDATE public.apostas_unificada
    SET status = 'PENDENTE', resultado = NULL, lucro_prejuizo = 0
    WHERE id = p_aposta_id;

    PERFORM public.liquidar_aposta_v4(p_aposta_id, p_novo_resultado, p_lucro_prejuizo);

    -- Causa B: guarda anti-saldo-negativo (transação inteira é revertida se falhar)
    SELECT COALESCE(SUM(valor), 0) INTO v_saldo_pos
    FROM public.financial_events
    WHERE bookmaker_id = v_aposta.bookmaker_id
      AND tipo_uso = 'NORMAL';

    IF v_saldo_pos < -0.005 THEN
        RAISE EXCEPTION 'Saldo insuficiente para re-liquidar — ajuste manual requerido. Saldo resultante na casa: %', ROUND(v_saldo_pos::numeric, 2)
            USING ERRCODE = 'P0001';
    END IF;

    PERFORM public.sync_bookmaker_balance_from_ledger(v_aposta.bookmaker_id);

    RETURN jsonb_build_object('success', true, 'auditados', v_eventos_count, 'saldo_resultante', v_saldo_pos);
END;
$function$;
