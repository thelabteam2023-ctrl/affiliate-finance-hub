-- Correção: liquidar_perna_surebet_v1 estava gravando FREEBET_PAYOUT com tipo_uso='FREEBET',
-- fazendo o lucro de freebet SNR permanecer no saldo_freebet em vez de virar saldo real.
-- Padrão vigente: FREEBET_PAYOUT sempre com tipo_uso='NORMAL' (lucro vai para saldo_atual).
-- VOID_REFUND permanece com tipo_uso='FREEBET' quando a stake original era freebet (correto).

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
            'NORMAL',
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
          'NORMAL',
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

-- Guardrail: bloquear futuros FREEBET_PAYOUT com tipo_uso <> 'NORMAL'
ALTER TABLE public.financial_events
  ADD CONSTRAINT chk_freebet_payout_tipo_uso_normal
  CHECK (tipo_evento <> 'FREEBET_PAYOUT' OR tipo_uso = 'NORMAL')
  NOT VALID;

NOTIFY pgrst, 'reload schema';