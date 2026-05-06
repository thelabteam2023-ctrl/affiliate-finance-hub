CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(p_perna_id uuid, p_resultado text, p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 AS $function$
DECLARE
  v_surebet_id UUID;
  v_old_resultado TEXT;
  v_entry RECORD;
  v_payout NUMERIC := 0;
  v_refund NUMERIC := 0;
  v_is_fb BOOLEAN;
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
BEGIN
  -- Contexto para evitar disparos recursivos desnecessários
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  -- Carregar dados da perna com lock
  SELECT ap.aposta_id, ap.resultado, ap.bookmaker_id, ap.stake, ap.odd, ap.moeda, COALESCE(ap.fonte_saldo, 'REAL') as fonte_saldo
  INTO v_perna_lógica
  FROM public.apostas_pernas ap
  WHERE ap.id = p_perna_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;

  v_surebet_id := v_perna_lógica.aposta_id;
  v_old_resultado := v_perna_lógica.resultado;

  -- Lock na aposta unificada
  PERFORM 1 FROM public.apostas_unificada au WHERE au.id = v_surebet_id FOR UPDATE;

  -- 1) ESTORNAR EVENTOS ANTERIORES (Idempotência de Reset)
  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    origem, valor, moeda, idempotency_key, reversed_event_id, descricao, created_by
  )
  SELECT 
    fe.bookmaker_id, fe.aposta_id, fe.workspace_id, 'REVERSAL', fe.tipo_uso,
    'liquidation_reset', -fe.valor, fe.moeda,
    'rev_' || fe.id,
    fe.id, 'Estorno para re-liquidação (Perna Composta)', auth.uid()
  FROM public.financial_events fe
  WHERE fe.aposta_id = v_surebet_id
    AND fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
    AND (
      fe.idempotency_key LIKE '%perna_' || p_perna_id || '%' OR
      fe.idempotency_key LIKE '%payout_perna_' || p_perna_id || '%' OR
      fe.idempotency_key LIKE '%voidrefund_perna_' || p_perna_id || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_events r 
      WHERE r.tipo_evento = 'REVERSAL' 
        AND r.reversed_event_id = fe.id
    )
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- 2) ATUALIZAR STATUS DA PERNA
  UPDATE public.apostas_pernas SET 
    resultado = CASE WHEN p_resultado = 'PENDENTE' THEN NULL ELSE p_resultado END,
    updated_at = NOW()
  WHERE id = p_perna_id;

  -- 3) PROCESSAR ENTRADAS (Multi-casas/Multi-moedas)
  SELECT EXISTS(SELECT 1 FROM public.apostas_perna_entradas WHERE perna_id = p_perna_id) INTO v_has_entries;

  IF p_resultado != 'PENDENTE' THEN
    IF v_has_entries THEN
      FOR v_entry IN 
        SELECT id, bookmaker_id, stake, odd, moeda, COALESCE(fonte_saldo, 'REAL') as fonte_saldo,
               (SELECT nome FROM public.bookmakers WHERE id = ae.bookmaker_id) as bk_nome
        FROM public.apostas_perna_entradas ae
        WHERE perna_id = p_perna_id
      LOOP
        v_is_fb := (v_entry.fonte_saldo = 'FREEBET');
        v_payout := 0;
        v_refund := 0;

        IF p_resultado = 'GREEN' THEN
          v_payout := CASE WHEN v_is_fb THEN v_entry.stake * (v_entry.odd - 1) ELSE v_entry.stake * v_entry.odd END;
          v_perna_lucro_acumulado := v_perna_lucro_acumulado + (v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END));
        
        ELSIF p_resultado = 'MEIO_GREEN' THEN
          -- Metade Ganha, Metade Reembolsada
          v_payout := CASE 
            WHEN v_is_fb THEN (v_entry.stake * (v_entry.odd - 1)) / 2
            ELSE (v_entry.stake / 2) + ((v_entry.stake / 2) * v_entry.odd)
          END;
          v_perna_lucro_acumulado := v_perna_lucro_acumulado + (v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END));

        ELSIF p_resultado = 'MEIO_RED' THEN
          -- Metade Perdida, Metade Reembolsada
          v_refund := v_entry.stake / 2;
          v_perna_lucro_acumulado := v_perna_lucro_acumulado - (CASE WHEN v_is_fb THEN 0 ELSE (v_entry.stake / 2) END);

        ELSIF p_resultado = 'RED' THEN
          v_perna_lucro_acumulado := v_perna_lucro_acumulado - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END);

        ELSIF p_resultado = 'VOID' THEN
          v_refund := v_entry.stake;
          v_perna_lucro_acumulado := 0;
        END IF;

        -- Inserir Payout se houver
        IF v_payout > 0 THEN
          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id,
            CASE WHEN v_is_fb THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
            CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
            'LUCRO', v_payout, v_entry.moeda,
            'payout_perna_' || p_perna_id || '_ent_' || v_entry.id,
            format('Payout %s Perna Composta (%s)', p_resultado, v_entry.bk_nome),
            auth.uid()
          ) ON CONFLICT (idempotency_key) DO NOTHING;
          v_events_count := v_events_count + 1;
        END IF;

        -- Inserir Reembolso/Void se houver
        IF v_refund > 0 THEN
          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
            CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
            'ESTORNO', v_refund, v_entry.moeda,
            'voidrefund_perna_' || p_perna_id || '_ent_' || v_entry.id,
            format('Reembolso %s Perna Composta (%s)', p_resultado, v_entry.bk_nome),
            auth.uid()
          ) ON CONFLICT (idempotency_key) DO NOTHING;
          v_events_count := v_events_count + 1;
        END IF;

      END LOOP;
    ELSE
      -- Fallback para pernas sem entradas explicitas (legado)
      v_is_fb := (v_perna_lógica.fonte_saldo = 'FREEBET');
      v_payout := 0;
      v_refund := 0;

      IF p_resultado = 'GREEN' THEN
        v_payout := CASE WHEN v_is_fb THEN v_perna_lógica.stake * (v_perna_lógica.odd - 1) ELSE v_perna_lógica.stake * v_perna_lógica.odd END;
        v_perna_lucro_acumulado := v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_perna_lógica.stake END);
      ELSIF p_resultado = 'MEIO_GREEN' THEN
        v_payout := CASE WHEN v_is_fb THEN (v_perna_lógica.stake * (v_perna_lógica.odd - 1)) / 2 ELSE (v_perna_lógica.stake / 2) + ((v_perna_lógica.stake / 2) * v_perna_lógica.odd) END;
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

      IF v_payout > 0 THEN
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, created_by
        ) VALUES (
          v_perna_lógica.bookmaker_id, v_surebet_id, p_workspace_id,
          CASE WHEN v_is_fb THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
          CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
          'LUCRO', v_payout, v_perna_lógica.moeda,
          'payout_perna_' || p_perna_id,
          format('Payout %s Perna Simples', p_resultado),
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
          CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
          'ESTORNO', v_refund, v_perna_lógica.moeda,
          'voidrefund_perna_' || p_perna_id,
          'Reembolso VOID Perna Simples',
          auth.uid()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
        v_events_count := v_events_count + 1;
      END IF;
    END IF;
  END IF;

  -- Atualizar o lucro local da perna
  UPDATE public.apostas_pernas
  SET lucro_prejuizo = v_perna_lucro_acumulado
  WHERE id = p_perna_id;

  -- 4) RECALCULAR TOTAIS DA SUREBET (KPIs Consolidados)
  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency, r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency, v_pl_consolidado, v_stake_consolidado, v_consol_currency
  FROM public.fn_recalc_pai_surebet(v_surebet_id) r;

  UPDATE public.apostas_unificada SET
    status = CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PENDENTE' END,
    resultado = v_resultado_final,
    stake_total = v_stake_total,
    lucro_prejuizo = v_lucro_total,
    is_multicurrency = v_is_multicurrency,
    pl_consolidado = v_pl_consolidado,
    stake_consolidado = v_stake_consolidado,
    consolidation_currency = v_consol_currency,
    updated_at = NOW()
  WHERE id = v_surebet_id;

  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'resultado', p_resultado,
    'events_created', v_events_count,
    'todas_liquidadas', v_todas_liquidadas,
    'lucro_realizado', v_lucro_total,
    'pl_consolidado', v_pl_consolidado
  );
END;
$function$;
