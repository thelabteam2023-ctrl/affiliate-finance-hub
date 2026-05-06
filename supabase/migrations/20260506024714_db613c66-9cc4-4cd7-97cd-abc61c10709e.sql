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
  v_is_fb BOOLEAN;
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC;
  v_stake_total NUMERIC;
  v_resultado_final TEXT;
  v_is_multicurrency BOOLEAN;
  v_events_count INTEGER := 0;
  v_has_entries BOOLEAN := false;
  v_perna_lógica RECORD;
BEGIN
  -- 1. Iniciar contexto de recálculo (bypass triggers de proteção)
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  -- 2. Buscar dados da perna lógica e travar para atualização
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

  -- 3. Travar aposta pai
  PERFORM 1 FROM public.apostas_unificada au WHERE au.id = v_surebet_id FOR UPDATE;

  -- Se resultado for igual, no-op
  IF COALESCE(v_old_resultado, 'PENDENTE') = p_resultado THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já é o mesmo', 'perna_id', p_perna_id);
  END IF;

  -- 4. Estornar liquidações anteriores de TODAS as entradas desta perna
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
    -- Critério de matching por perna lógica
    AND (
      fe.idempotency_key LIKE '%perna_' || p_perna_id || '%' OR
      fe.idempotency_key LIKE '%payout_perna_' || p_perna_id || '%' OR
      fe.idempotency_key LIKE '%voidrefund_perna_' || p_perna_id || '%'
    );

  -- 5. Atualizar o resultado na perna lógica
  UPDATE public.apostas_pernas SET
    resultado = CASE WHEN p_resultado = 'PENDENTE' THEN NULL ELSE p_resultado END,
    updated_at = NOW()
  WHERE id = p_perna_id;

  -- 6. Processar entradas individuais (se existirem) ou usar a perna como entrada única
  SELECT EXISTS(SELECT 1 FROM public.apostas_perna_entradas WHERE perna_id = p_perna_id) INTO v_has_entries;

  IF p_resultado != 'PENDENTE' THEN
    -- Caso a: Perna possui sub-entradas detalhadas
    IF v_has_entries THEN
      FOR v_entry IN 
        SELECT id, bookmaker_id, stake, odd, moeda, COALESCE(fonte_saldo, 'REAL') as fonte_saldo,
               (SELECT nome FROM public.bookmakers WHERE id = ae.bookmaker_id) as bk_nome
        FROM public.apostas_perna_entradas ae 
        WHERE perna_id = p_perna_id 
      LOOP
        v_is_fb := (v_entry.fonte_saldo = 'FREEBET');
        
        IF p_resultado = 'GREEN' THEN
          v_payout := CASE WHEN v_is_fb THEN v_entry.stake * (v_entry.odd - 1) ELSE v_entry.stake * v_entry.odd END;
          
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
    -- Caso b: Perna simples (sem sub-entradas)
    ELSE
      v_is_fb := (v_perna_lógica.fonte_saldo = 'FREEBET');
      IF p_resultado = 'GREEN' THEN
        v_payout := CASE WHEN v_is_fb THEN v_perna_lógica.stake * (v_perna_lógica.odd - 1) ELSE v_perna_lógica.stake * v_perna_lógica.odd END;
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, created_by
        ) VALUES (
          v_perna_lógica.bookmaker_id, v_surebet_id, p_workspace_id,
          CASE WHEN v_is_fb THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
          CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
          'LUCRO', v_payout, v_perna_lógica.moeda,
          'payout_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
          format('Payout %s Perna %s', p_resultado, p_perna_id),
          auth.uid()
        );
        v_events_count := v_events_count + 1;
      ELSIF p_resultado = 'VOID' THEN
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, created_by
        ) VALUES (
          v_perna_lógica.bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
          CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
          'ESTORNO', v_perna_lógica.stake, v_perna_lógica.moeda,
          'voidrefund_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
          format('Reembolso VOID Perna %s', p_perna_id),
          auth.uid()
        );
        v_events_count := v_events_count + 1;
      END IF;
    END IF;
  END IF;

  -- 7. Recalcular toda a operação pai
  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency
  FROM public.fn_recalc_pai_surebet(v_surebet_id) r;

  UPDATE public.apostas_unificada SET
    status = CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PENDENTE' END,
    resultado = v_resultado_final,
    stake_total = v_stake_total,
    lucro_prejuizo = CASE WHEN v_todas_liquidadas THEN v_lucro_total ELSE NULL END,
    is_multicurrency = v_is_multicurrency,
    updated_at = NOW()
  WHERE id = v_surebet_id;

  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'resultado', p_resultado,
    'events_created', v_events_count,
    'todas_liquidadas', v_todas_liquidadas
  );
END;
$function$;