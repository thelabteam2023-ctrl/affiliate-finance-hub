-- 1. Função para recalcular os agregados de uma perna baseada em suas entradas
CREATE OR REPLACE FUNCTION public.recalcular_perna_por_entradas(p_perna_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total_stake NUMERIC := 0;
  v_total_payout NUMERIC := 0;
  v_weighted_odd NUMERIC := 0;
BEGIN
  -- Calcular totais das entradas
  SELECT 
    COALESCE(SUM(stake), 0),
    COALESCE(SUM(stake * odd), 0)
  INTO v_total_stake, v_total_payout
  FROM public.apostas_perna_entradas
  WHERE perna_id = p_perna_id;

  IF v_total_stake > 0 THEN
    v_weighted_odd := v_total_payout / v_total_stake;
  END IF;

  -- Atualizar a perna pai (seleção)
  UPDATE public.apostas_pernas
  SET 
    stake = v_total_stake,
    odd = v_weighted_odd,
    updated_at = NOW()
  WHERE id = p_perna_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualizar criar_surebet_atomica para suportar sub-entradas (opcional via JSON)
-- Mas para manter compatibilidade com o loop atual, vamos garantir que ela limpe entradas antigas se re-executada
-- Nota: A criar_surebet_atomica já insere em apostas_perna_entradas, mas vamos garantir o vínculo correto.

-- 3. Refatoração da editar_surebet_completa_v1 para gerenciar a hierarquia completa
CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v2(
  p_aposta_id UUID,
  p_pernas JSONB, -- Array de pernas (seleções)
  p_entradas JSONB, -- NOVO: Array flat de entradas vinculadas às seleções
  p_evento TEXT,
  p_esporte TEXT,
  p_mercado TEXT,
  p_modelo TEXT,
  p_estrategia TEXT,
  p_contexto TEXT,
  p_data_aposta TIMESTAMPTZ,
  p_stake_total NUMERIC,
  p_stake_consolidado NUMERIC,
  p_lucro_esperado NUMERIC,
  p_roi_esperado NUMERIC,
  p_lucro_prejuizo NUMERIC DEFAULT NULL,
  p_roi_real NUMERIC DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_resultado TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_aposta record;
  v_workspace_id UUID;
  v_user_id UUID;
  v_elem jsonb;
  v_perna_id UUID;
  v_entrada_id UUID;
  v_existing_perna_ids UUID[];
  v_input_perna_ids UUID[] := '{}';
  v_existing_entrada_ids UUID[];
  v_input_entrada_ids UUID[] := '{}';
  v_idx INTEGER := 0;
  v_perna_idx INTEGER := 0;
BEGIN
  -- Bloquear aposta para atualização
  SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada'); END IF;
  
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;

  -- 1. Sincronizar PERNAS (Seleções)
  SELECT COALESCE(array_agg(id), '{}') INTO v_existing_perna_ids FROM public.apostas_pernas WHERE aposta_id = p_aposta_id;
  
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
      INSERT INTO public.apostas_pernas (
        aposta_id, ordem, selecao, selecao_livre, bookmaker_id, stake, odd, moeda
      ) VALUES (
        p_aposta_id, v_perna_idx, v_elem->>'selecao', v_elem->>'selecao_livre', 
        (v_elem->>'bookmaker_id')::UUID, (v_elem->>'stake')::NUMERIC, (v_elem->>'odd')::NUMERIC, COALESCE(v_elem->>'moeda', 'BRL')
      ) RETURNING id INTO v_perna_id;
      v_input_perna_ids := array_append(v_input_perna_ids, v_perna_id);
    END IF;
  END LOOP;

  -- Deletar pernas removidas
  DELETE FROM public.apostas_pernas WHERE aposta_id = p_aposta_id AND id <> ALL(v_input_perna_ids);

  -- 2. Sincronizar ENTRADAS (Casas/Moedas) vinculadas às pernas
  -- O array p_entradas deve conter o perna_index (referência ao array p_pernas) ou perna_id
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_entradas) LOOP
    v_idx := v_idx + 1;
    v_entrada_id := (v_elem->>'id')::UUID;
    
    -- Se tiver perna_index, resolvemos para o v_perna_id correto baseado na ordem
    IF v_elem ? 'perna_index' THEN
      v_perna_id := v_input_perna_ids[(v_elem->>'perna_index')::INTEGER + 1];
    ELSE
      v_perna_id := (v_elem->>'perna_id')::UUID;
    END IF;

    IF v_entrada_id IS NOT NULL THEN
      v_input_entrada_ids := array_append(v_input_entrada_ids, v_entrada_id);
      UPDATE public.apostas_perna_entradas SET
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
      -- Nova entrada: Criar e gerar evento financeiro de STAKE
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

      -- Gerar débito no saldo
      INSERT INTO public.financial_events (
        bookmaker_id, workspace_id, aposta_id, tipo_evento, tipo_uso, valor, moeda, idempotency_key, descricao, created_by
      ) VALUES (
        (v_elem->>'bookmaker_id')::UUID, v_workspace_id, p_aposta_id,
        CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
        CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
        -(v_elem->>'stake')::NUMERIC, COALESCE(v_elem->>'moeda', 'BRL'),
        'edit_new_in_' || v_entrada_id || '_' || extract(epoch from now()),
        'Ajuste de stake (entrada adicional)', v_user_id
      );
    END IF;
  END LOOP;

  -- Limpeza de entradas órfãs (não presentes no input)
  -- Nota: Em uma edição completa, entradas não enviadas devem ser estornadas e deletadas
  DECLARE
    v_orphans UUID[];
    v_orphan_id UUID;
  BEGIN
    SELECT array_agg(id) INTO v_orphans 
    FROM public.apostas_perna_entradas 
    WHERE perna_id = ANY(v_input_perna_ids) AND id <> ALL(v_input_entrada_ids);
    
    IF v_orphans IS NOT NULL THEN
      FOR v_orphan_id IN SELECT unnest(v_orphans) LOOP
        -- Estornar valor antes de deletar
        INSERT INTO public.financial_events (
          bookmaker_id, workspace_id, aposta_id, tipo_evento, tipo_uso, valor, moeda, idempotency_key, descricao
        )
        SELECT bookmaker_id, v_workspace_id, p_aposta_id, 'REVERSAL', tipo_uso, -valor, moeda, 
               'rev_del_' || v_orphan_id || '_' || extract(epoch from now()), 'Estorno por remoção de entrada'
        FROM public.financial_events WHERE idempotency_key LIKE '%' || v_orphan_id || '%';
        
        DELETE FROM public.apostas_perna_entradas WHERE id = v_orphan_id;
      END LOOP;
    END IF;
  END;

  -- 3. Recalcular pernas e aposta pai
  FOR v_perna_id IN SELECT unnest(v_input_perna_ids) LOOP
    PERFORM public.recalcular_perna_por_entradas(v_perna_id);
  END LOOP;

  UPDATE public.apostas_unificada SET
    evento = p_evento, esporte = p_esporte, mercado = p_mercado, modelo = p_modelo,
    estrategia = p_estrategia, contexto_operacional = p_contexto, data_aposta = p_data_aposta,
    stake_total = p_stake_total, stake_consolidado = p_stake_consolidado,
    lucro_esperado = p_lucro_esperado, roi_esperado = p_roi_esperado,
    lucro_prejuizo = p_lucro_prejuizo, roi_real = p_roi_real, status = p_status, resultado = p_resultado,
    updated_at = NOW()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object('success', true, 'aposta_id', p_aposta_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
