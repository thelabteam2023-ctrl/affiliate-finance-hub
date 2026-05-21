CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v3(p_aposta_id uuid, p_pernas jsonb, p_entradas jsonb, p_evento text, p_esporte text, p_mercado text, p_modelo text, p_estrategia text, p_contexto text, p_data_aposta timestamp with time zone, p_status_manual text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_aposta record;
  v_workspace_id UUID;
  v_user_id UUID;
  v_elem jsonb;
  v_perna_id UUID;
  v_entrada_id UUID;
  v_perna_idx INTEGER := 0;
  v_input_perna_ids UUID[] := '{}';
  v_input_entrada_ids UUID[] := '{}';
  
  -- Para recálculo
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC;
  v_stake_total NUMERIC;
  v_resultado_final TEXT;
  v_is_multicurrency BOOLEAN;
  v_pl_consolidado NUMERIC;
  v_stake_consolidado NUMERIC;
  v_consol_currency TEXT;
BEGIN
  -- Habilitar contexto de recálculo para bypassar triggers de bloqueio
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  -- 1. Bloquear e carregar aposta
  SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada'); END IF;
  
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := auth.uid();

  -- 2. Sincronizar PERNAS
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_perna_idx := v_perna_idx + 1;
    v_perna_id := (v_elem->>'id')::UUID;
    
    IF v_perna_id IS NOT NULL THEN
      v_input_perna_ids := array_append(v_input_perna_ids, v_perna_id);
      UPDATE public.apostas_pernas SET
        selecao = v_elem->>'selecao',
        selecao_livre = v_elem->>'selecao_livre',
        ordem = v_perna_idx,
        resultado = COALESCE(v_elem->>'resultado', resultado),
        updated_at = NOW()
      WHERE id = v_perna_id;
    ELSE
      -- Nova perna
      INSERT INTO public.apostas_pernas (
        aposta_id, ordem, selecao, selecao_livre, bookmaker_id, stake, odd, moeda, resultado
      ) VALUES (
        p_aposta_id, v_perna_idx, v_elem->>'selecao', v_elem->>'selecao_livre', 
        (v_elem->>'casa_id')::UUID, 1, 1, 'BRL', v_elem->>'resultado' -- Valores temporários, serão atualizados pelas entradas
      ) RETURNING id INTO v_perna_id;
      v_input_perna_ids := array_append(v_input_perna_ids, v_perna_id);
    END IF;
  END LOOP;

  -- Deletar pernas removidas e seus eventos
  DELETE FROM public.apostas_pernas WHERE aposta_id = p_aposta_id AND id <> ALL(v_input_perna_ids);

  -- 3. Sincronizar ENTRADAS e Ledger de STAKE
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_entradas) LOOP
    v_entrada_id := (v_elem->>'id')::UUID;
    v_perna_id := NULL;
    
    -- Resolve perna_id com maior flexibilidade
    IF v_entrada_id IS NOT NULL THEN
      -- Se a entrada já existe, pegamos o perna_id dela
      SELECT perna_id INTO v_perna_id FROM public.apostas_perna_entradas WHERE id = v_entrada_id;
    END IF;

    -- Se ainda não tem perna_id (entrada nova ou perna mudou), resolve via indices/ordem
    IF v_perna_id IS NULL THEN
      IF v_elem ? 'perna_id' AND (v_elem->>'perna_id') IS NOT NULL THEN
        v_perna_id := (v_elem->>'perna_id')::UUID;
      ELSIF v_elem ? 'perna_index' THEN
        v_perna_id := v_input_perna_ids[(v_elem->>'perna_index')::INTEGER + 1];
      ELSIF v_elem ? 'perna_ordem' THEN
        v_perna_id := v_input_perna_ids[(v_elem->>'perna_ordem')::INTEGER];
      END IF;
    END IF;

    -- Trava de segurança: se não resolveu a perna, erro nulo que o usuário reportou
    IF v_perna_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Não foi possível associar a entrada a uma perna válida (perna_id NULL)');
    END IF;

    IF v_entrada_id IS NOT NULL THEN
      v_input_entrada_ids := array_append(v_input_entrada_ids, v_entrada_id);
      UPDATE public.apostas_perna_entradas SET
        perna_id = v_perna_id, -- Garante consistência se mudou
        bookmaker_id = (v_elem->>'bookmaker_id')::UUID,
        stake = (v_elem->>'stake')::NUMERIC,
        odd = (v_elem->>'odd')::NUMERIC,
        moeda = COALESCE(v_elem->>'moeda', 'BRL'),
        fonte_saldo = COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        stake_real = CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN 0 ELSE (v_elem->>'stake')::NUMERIC END,
        stake_freebet = CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN (v_elem->>'stake')::NUMERIC ELSE 0 END,
        updated_at = NOW()
      WHERE id = v_entrada_id;
    ELSE
      -- Nova entrada
      INSERT INTO public.apostas_perna_entradas (
        perna_id, bookmaker_id, stake, odd, moeda, fonte_saldo,
        stake_real, stake_freebet, created_at, updated_at
      ) VALUES (
        v_perna_id, (v_elem->>'bookmaker_id')::UUID, (v_elem->>'stake')::NUMERIC, (v_elem->>'odd')::NUMERIC,
        COALESCE(v_elem->>'moeda', 'BRL'), COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN 0 ELSE (v_elem->>'stake')::NUMERIC END,
        CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN (v_elem->>'stake')::NUMERIC ELSE 0 END,
        NOW(), NOW()
      ) RETURNING id INTO v_entrada_id;
      v_input_entrada_ids := array_append(v_input_entrada_ids, v_entrada_id);
    END IF;

    -- Sincronizar Ledger de STAKE (Upsert estável via fn_sync_stake_event_v1)
    PERFORM public.fn_sync_stake_event_v1(
      v_entrada_id, p_aposta_id, v_workspace_id, (v_elem->>'bookmaker_id')::UUID, 
      (v_elem->>'stake')::NUMERIC, COALESCE(v_elem->>'moeda', 'BRL'), 
      COALESCE(v_elem->>'fonte_saldo', 'REAL'), v_user_id
    );
  END LOOP;

  -- 4. Limpeza de entradas órfãs e estorno de seus STAKES
  INSERT INTO public.financial_events (
    bookmaker_id, workspace_id, aposta_id, tipo_evento, tipo_uso, valor, moeda, idempotency_key, descricao, created_by
  )
  SELECT 
    fe.bookmaker_id, fe.workspace_id, fe.aposta_id, 'REVERSAL', fe.tipo_uso, -fe.valor, fe.moeda, 
    'rev_stake_del_' || ae.id, 'Estorno por remoção de entrada', v_user_id
  FROM public.apostas_perna_entradas ae
  JOIN public.financial_events fe ON fe.idempotency_key = 'stake_entry_' || ae.id
  WHERE ae.perna_id = ANY(v_input_perna_ids) AND ae.id <> ALL(v_input_entrada_ids)
  ON CONFLICT (idempotency_key) DO NOTHING;

  DELETE FROM public.apostas_perna_entradas WHERE perna_id = ANY(v_input_perna_ids) AND id <> ALL(v_input_entrada_ids);

  -- 5. Sincronizar Ledger de PAYOUT (Liquidação)
  FOR v_perna_id IN SELECT unnest(v_input_perna_ids) LOOP
    DECLARE
      v_res_perna TEXT;
    BEGIN
      SELECT resultado INTO v_res_perna FROM public.apostas_pernas WHERE id = v_perna_id;
      IF v_res_perna IS NOT NULL THEN
        PERFORM public.liquidar_perna_surebet_v1(v_perna_id, v_res_perna, v_workspace_id);
      END IF;
    END;
  END LOOP;

  -- 6. Recálculo Final Agregado (Pai)
  UPDATE public.apostas_unificada SET
    is_manual_override = false,
    manual_override_at = NULL,
    manual_override_by = NULL,
    manual_override_reason = NULL,
    evento = p_evento, esporte = p_esporte, mercado = p_mercado, modelo = p_modelo,
    estrategia = p_estrategia, contexto_operacional = p_contexto, data_aposta = p_data_aposta,
    updated_at = NOW()
  WHERE id = p_aposta_id;

  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency, r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency, v_pl_consolidado, v_stake_consolidado, v_consol_currency
  FROM public.fn_recalc_pai_surebet(p_aposta_id) r;

  UPDATE public.apostas_unificada SET
    status = COALESCE(p_status_manual, CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PENDENTE' END),
    resultado = v_resultado_final,
    stake_total = v_stake_total,
    lucro_prejuizo = v_lucro_total,
    is_multicurrency = v_is_multicurrency,
    pl_consolidado = v_pl_consolidado,
    stake_consolidado = v_stake_consolidado,
    consolidation_currency = v_consol_currency
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object(
    'success', true, 
    'aposta_id', p_aposta_id, 
    'calculated_profit', v_lucro_total,
    'status', (SELECT status FROM public.apostas_unificada WHERE id = p_aposta_id)
  );
END;
$function$;
