CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(p_perna_id uuid, p_resultado text, p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_surebet_id UUID;
  v_old_resultado TEXT;
  v_entry RECORD;
  v_payout NUMERIC := 0;
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
  -- Contexto de recálculo (bypass triggers de proteção)
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  -- 1. Buscar a perna e travar para atualização
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

  -- 2. Travar a aposta pai
  PERFORM 1 FROM public.apostas_unificada au WHERE au.id = v_surebet_id FOR UPDATE;

  -- 3. Estornar eventos financeiros anteriores desta perna (PAYOUT/VOID)
  -- NOTA: Estornamos apenas eventos que tenham o perna_id na idempotency_key
  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    origem, valor, moeda, idempotency_key, reversed_event_id, descricao, created_by
  )
  SELECT 
    fe.bookmaker_id, fe.aposta_id, fe.workspace_id, 'REVERSAL', fe.tipo_uso,
    'liquidation_reset', -fe.valor, fe.moeda,
    'rev_' || fe.id || '_' || extract(epoch from now())::text,
    fe.id, 'Estorno para re-liquidação (Perna Composta)', auth.uid()
  FROM public.financial_events fe
  WHERE fe.aposta_id = v_surebet_id
    AND fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
    AND (
      fe.idempotency_key LIKE '%perna_' || p_perna_id || '%' OR
      fe.idempotency_key LIKE '%payout_perna_' || p_perna_id || '%' OR
      fe.idempotency_key LIKE '%voidrefund_perna_' || p_perna_id || '%'
    );

  -- 4. Atualizar o resultado da perna
  UPDATE public.apostas_pernas SET
    resultado = CASE WHEN p_resultado = 'PENDENTE' THEN NULL ELSE p_resultado END,
    updated_at = NOW()
  WHERE id = p_perna_id;

  -- 5. Se não for PENDENTE, gerar novos eventos para as entradas desta perna
  SELECT EXISTS(SELECT 1 FROM public.apostas_perna_entradas WHERE perna_id = p_perna_id) INTO v_has_entries;

  IF p_resultado != 'PENDENTE' THEN
    IF v_has_entries THEN
      -- Iterar pelas entradas reais da perna
      FOR v_entry IN 
        SELECT id, bookmaker_id, stake, odd, moeda, COALESCE(fonte_saldo, 'REAL') as fonte_saldo,
               (SELECT nome FROM public.bookmakers WHERE id = ae.bookmaker_id) as bk_nome
        FROM public.apostas_perna_entradas ae 
        WHERE perna_id = p_perna_id 
      LOOP
        v_is_fb := (v_entry.fonte_saldo = 'FREEBET');
        
        IF p_resultado = 'GREEN' THEN
          v_payout := CASE WHEN v_is_fb THEN v_entry.stake * (v_entry.odd - 1) ELSE v_entry.stake * v_entry.odd END;
          
          -- Calcular lucro individual da entrada para acumular na perna
          v_perna_lucro_acumulado := v_perna_lucro_acumulado + (v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END));

          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id,
            CASE WHEN v_is_fb THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
            CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
            'LUCRO', v_payout, v_entry.moeda,
            'payout_perna_' || p_perna_id || '_ent_' || v_entry.id || '_' || extract(epoch from now())::text,
            format('Payout %s Perna Composta (%s)', p_resultado, v_entry.bk_nome),
            auth.uid()
          );
          v_events_count := v_events_count + 1;
        ELSIF p_resultado = 'RED' THEN
          v_perna_lucro_acumulado := v_perna_lucro_acumulado - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END);
        ELSIF p_resultado = 'VOID' THEN
          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
            CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
            'ESTORNO', v_entry.stake, v_entry.moeda,
            'voidrefund_perna_' || p_perna_id || '_ent_' || v_entry.id || '_' || extract(epoch from now())::text,
            format('Reembolso VOID Perna Composta (%s)', v_entry.bk_nome),
            auth.uid()
          );
          v_events_count := v_events_count + 1;
        END IF;
      END LOOP;
    ELSE
      -- Legado ou perna simples sem entradas detalhadas
      v_is_fb := (v_perna_lógica.fonte_saldo = 'FREEBET');
      IF p_resultado = 'GREEN' THEN
        v_payout := CASE WHEN v_is_fb THEN v_perna_lógica.stake * (v_perna_lógica.odd - 1) ELSE v_perna_lógica.stake * v_perna_lógica.odd END;
        v_perna_lucro_acumulado := v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_perna_lógica.stake END);
        
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, created_by
        ) VALUES (
          v_perna_lógica.bookmaker_id, v_surebet_id, p_workspace_id,
          CASE WHEN v_is_fb THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
          CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
          'LUCRO', v_payout, v_perna_lógica.moeda,
          'payout_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
          format('Payout %s Perna Simples', p_resultado),
          auth.uid()
        );
        v_events_count := v_events_count + 1;
      ELSIF p_resultado = 'RED' THEN
        v_perna_lucro_acumulado := -(CASE WHEN v_is_fb THEN 0 ELSE v_perna_lógica.stake END);
      ELSIF p_resultado = 'VOID' THEN
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, created_by
        ) VALUES (
          v_perna_lógica.bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
          CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
          'ESTORNO', v_perna_lógica.stake, v_perna_lógica.moeda,
          'voidrefund_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
          format('Reembolso VOID Perna Simples'),
          auth.uid()
        );
        v_events_count := v_events_count + 1;
      END IF;
    END IF;
  END IF;

  -- 6. Sincronizar lucro_prejuizo na perna (essencial para o trigger de consolidação da aposta unificada)
  UPDATE public.apostas_pernas 
  SET lucro_prejuizo = v_perna_lucro_acumulado
  WHERE id = p_perna_id;

  -- 7. Recalcular a aposta pai usando a função de agregação que olha para as ENTRADAS
  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency, r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency, v_pl_consolidado, v_stake_consolidado, v_consol_currency
  FROM public.fn_recalc_pai_surebet(v_surebet_id) r;

  -- 8. Atualizar a aposta pai com todos os campos, incluindo os de consolidação
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