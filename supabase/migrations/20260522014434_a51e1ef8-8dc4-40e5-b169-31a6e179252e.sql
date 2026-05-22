CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v3(
  p_aposta_id uuid, 
  p_pernas jsonb, 
  p_entradas jsonb, 
  p_evento text, 
  p_esporte text, 
  p_mercado text, 
  p_modelo text, 
  p_estrategia text, 
  p_contexto text, 
  p_data_aposta timestamp with time zone, 
  p_status_manual text DEFAULT NULL::text
)
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
        (v_elem->>'bookmaker_id')::UUID, 1, 1, 'BRL', v_elem->>'resultado'
      ) RETURNING id INTO v_perna_id;
      v_input_perna_ids := array_append(v_input_perna_ids, v_perna_id);
    END IF;
  END LOOP;

  -- Deletar pernas removidas
  DELETE FROM public.apostas_pernas WHERE aposta_id = p_aposta_id AND id <> ALL(v_input_perna_ids);

  -- 3. Sincronizar ENTRADAS
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_entradas) LOOP
    v_entrada_id := (v_elem->>'id')::UUID;
    v_perna_id := NULL;
    
    -- Resolve perna_id
    IF v_entrada_id IS NOT NULL THEN
      SELECT perna_id INTO v_perna_id FROM public.apostas_perna_entradas WHERE id = v_entrada_id;
    END IF;

    IF v_perna_id IS NULL THEN
      IF v_elem ? 'perna_id' AND (v_elem->>'perna_id') IS NOT NULL THEN
        v_perna_id := (v_elem->>'perna_id')::UUID;
      ELSIF v_elem ? 'perna_index' THEN
        v_perna_id := v_input_perna_ids[(v_elem->>'perna_index')::INTEGER + 1];
      ELSIF v_elem ? 'perna_ordem' THEN
        v_perna_id := v_input_perna_ids[(v_elem->>'perna_ordem')::INTEGER];
      END IF;
    END IF;

    IF v_perna_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Não foi possível associar a entrada a uma perna válida (perna_id NULL)');
    END IF;

    IF v_entrada_id IS NOT NULL THEN
      v_input_entrada_ids := array_append(v_input_entrada_ids, v_entrada_id);
      UPDATE public.apostas_perna_entradas SET
        perna_id = v_perna_id,
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

    -- Sincronizar Ledger
    PERFORM public.fn_sync_stake_event_v1(
      v_entrada_id, p_aposta_id, v_workspace_id, (v_elem->>'bookmaker_id')::UUID,
      (v_elem->>'stake')::NUMERIC, COALESCE(v_elem->>'moeda', 'BRL'),
      COALESCE(v_elem->>'fonte_saldo', 'REAL'), v_user_id
    );
  END LOOP;

  -- Limpeza de entradas órfãs
  DELETE FROM public.apostas_perna_entradas WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id) AND id <> ALL(v_input_entrada_ids);

  -- 4. SINCRONIZAR CAMPOS DE RESUMO EM apostas_pernas (CORREÇÃO DE HIDRATAÇÃO)
  UPDATE public.apostas_pernas ap
  SET 
    stake = sub.total_stake,
    odd = sub.avg_odd,
    moeda = sub.main_moeda,
    bookmaker_id = sub.main_bookmaker_id
  FROM (
    SELECT 
      perna_id,
      SUM(stake) as total_stake,
      CASE WHEN SUM(stake) > 0 THEN SUM(odd * stake) / SUM(stake) ELSE MAX(odd) END as avg_odd,
      MAX(moeda) as main_moeda,
      MAX(bookmaker_id) as main_bookmaker_id
    FROM public.apostas_perna_entradas
    WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id)
    GROUP BY perna_id
  ) sub
  WHERE ap.id = sub.perna_id;

  -- 5. Atualizar cabeçalho da operação
  UPDATE public.apostas_unificada SET
    evento = p_evento,
    esporte = p_esporte,
    mercado = p_mercado,
    modelo = p_modelo,
    estrategia = p_estrategia,
    contexto_operacional = p_contexto,
    data_aposta = p_data_aposta,
    updated_at = NOW()
  WHERE id = p_aposta_id;

  -- 6. Recalcular Lucro/ROI Final
  PERFORM public.recalcular_kpis_surebet_v2(p_aposta_id);

  RETURN jsonb_build_object('success', true);
END;
$function$;