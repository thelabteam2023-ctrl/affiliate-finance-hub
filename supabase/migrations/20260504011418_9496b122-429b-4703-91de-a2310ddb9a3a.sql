CREATE OR REPLACE FUNCTION public.sync_pending_aposta_stake_v1(p_aposta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_active_stake_total NUMERIC;
  v_expected_stake NUMERIC;
  v_delta NUMERIC;
  v_event_id UUID;
  v_events_created INT := 0;
  v_user_id UUID;
BEGIN
  -- Identificar usuário
  v_user_id := auth.uid();
  
  -- Buscar aposta principal
  SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;

  -- Só permitimos sincronizar apostas PENDENTES
  IF v_aposta.status != 'PENDENTE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sincronização de stake só é permitida para apostas PENDENTES');
  END IF;

  -- Se for uma aposta com pernas (ARBITRAGEM ou MULTI-ENTRY)
  IF v_aposta.forma_registro = 'ARBITRAGEM' OR v_aposta.bookmaker_id IS NULL THEN
    FOR v_perna IN SELECT * FROM public.apostas_pernas WHERE aposta_id = p_aposta_id LOOP
      -- Calcular stake atual no ledger para esta perna
      SELECT COALESCE(SUM(fe.valor), 0)
      INTO v_active_stake_total
      FROM public.financial_events fe
      WHERE fe.aposta_id = p_aposta_id
        AND fe.bookmaker_id = v_perna.bookmaker_id
        AND fe.tipo_evento IN ('STAKE', 'FREEBET_STAKE', 'REVERSAL', 'AJUSTE')
        AND fe.reversed_event_id IS NULL;
      
      -- Ledger armazena débitos como negativo, então v_active_stake_total deve ser -v_perna.stake
      v_expected_stake := -v_perna.stake;
      v_delta := v_expected_stake - v_active_stake_total;

      IF ABS(v_delta) > 0.001 THEN
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_perna.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
          CASE WHEN v_delta < 0 THEN 'STAKE' ELSE 'REVERSAL' END,
          COALESCE(v_perna.fonte_saldo, 'NORMAL'),
          v_delta, v_perna.moeda,
          'sync_stake_' || p_aposta_id::TEXT || '_perna_' || v_perna.id::TEXT || '_' || extract(epoch from now())::TEXT,
          'Ajuste automático de stake (sincronização de edição)',
          now(), v_user_id
        ) RETURNING id INTO v_event_id;
        
        IF v_event_id IS NOT NULL THEN
          v_events_created := v_events_created + 1;
        END IF;
      END IF;
    END LOOP;
  ELSE
    -- Aposta simples
    SELECT COALESCE(SUM(fe.valor), 0)
    INTO v_active_stake_total
    FROM public.financial_events fe
    WHERE fe.aposta_id = p_aposta_id
      AND fe.bookmaker_id = v_aposta.bookmaker_id
      AND fe.tipo_evento IN ('STAKE', 'FREEBET_STAKE', 'REVERSAL', 'AJUSTE')
      AND fe.reversed_event_id IS NULL;
    
    v_expected_stake := -v_aposta.stake;
    v_delta := v_expected_stake - v_active_stake_total;

    IF ABS(v_delta) > 0.001 THEN
      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_aposta.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
        CASE WHEN v_delta < 0 THEN 'STAKE' ELSE 'REVERSAL' END,
        COALESCE(v_aposta.fonte_saldo, 'NORMAL'),
        v_delta, v_aposta.moeda_operacao,
        'sync_stake_' || p_aposta_id::TEXT || '_' || extract(epoch from now())::TEXT,
        'Ajuste automático de stake (sincronização de edição)',
        now(), v_user_id
      ) RETURNING id INTO v_event_id;
      
      IF v_event_id IS NOT NULL THEN
        v_events_created := v_events_created + 1;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'events_created', v_events_created,
    'message', format('Sincronização concluída: %s eventos de ajuste criados', v_events_created)
  );
END;
$function$;
