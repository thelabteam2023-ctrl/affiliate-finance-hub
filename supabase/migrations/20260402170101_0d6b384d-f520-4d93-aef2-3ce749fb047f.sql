
-- ============================================================
-- RPC: editar_surebet_completa_v1
-- Edição atômica de surebet: todas as mudanças em uma transação
-- Se qualquer operação falhar, NENHUMA alteração é persistida
-- ============================================================

CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v1(
  p_aposta_id UUID,
  p_pernas JSONB,
  p_evento TEXT DEFAULT NULL,
  p_esporte TEXT DEFAULT NULL,
  p_mercado TEXT DEFAULT NULL,
  p_modelo TEXT DEFAULT NULL,
  p_estrategia TEXT DEFAULT NULL,
  p_contexto TEXT DEFAULT NULL,
  p_data_aposta TEXT DEFAULT NULL,
  p_stake_total NUMERIC DEFAULT NULL,
  p_stake_consolidado NUMERIC DEFAULT NULL,
  p_lucro_esperado NUMERIC DEFAULT NULL,
  p_roi_esperado NUMERIC DEFAULT NULL,
  p_lucro_prejuizo NUMERIC DEFAULT NULL,
  p_roi_real NUMERIC DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_resultado TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_input JSONB;
  v_existing_ids UUID[];
  v_input_ids UUID[] := '{}';
  v_to_delete UUID[];
  v_perna_id UUID;
  v_workspace_id UUID;
  v_new_count INT := 0;
  v_edited_count INT := 0;
  v_deleted_count INT := 0;
  v_ordem INT := 0;
  v_elem JSONB;
  v_id_text TEXT;
BEGIN
  -- 1. Lock parent record (prevents concurrent edits)
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;
  
  v_workspace_id := v_aposta.workspace_id;
  
  -- 2. Get existing perna IDs
  SELECT COALESCE(array_agg(id), '{}') INTO v_existing_ids 
  FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  
  -- 3. Collect input IDs (pernas that have an existing ID)
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_id_text := v_elem->>'id';
    IF v_id_text IS NOT NULL AND v_id_text != '' THEN
      v_input_ids := array_append(v_input_ids, v_id_text::UUID);
    END IF;
  END LOOP;
  
  -- 4. Determine pernas to delete (exist in DB but not in input)
  SELECT COALESCE(array_agg(existing_id), '{}') INTO v_to_delete
  FROM unnest(v_existing_ids) AS existing_id
  WHERE existing_id != ALL(v_input_ids);
  
  -- 5. Delete removed pernas via existing RPC (handles financial reversal atomically)
  IF array_length(v_to_delete, 1) > 0 THEN
    FOR v_perna_id IN SELECT unnest(v_to_delete) LOOP
      PERFORM deletar_perna_surebet_v1(v_perna_id);
      v_deleted_count := v_deleted_count + 1;
    END LOOP;
  END IF;
  
  -- 6. Process each input perna in order
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_ordem := v_ordem + 1;
    v_id_text := v_elem->>'id';
    
    IF v_id_text IS NOT NULL AND v_id_text != '' AND (v_id_text::UUID) = ANY(v_existing_ids) THEN
      -- ===== EXISTING perna: edit via atomic RPC =====
      v_perna_id := v_id_text::UUID;
      SELECT * INTO v_perna FROM apostas_pernas WHERE id = v_perna_id;
      
      -- Only call edit RPC if data actually changed
      IF v_perna.bookmaker_id != (v_elem->>'bookmaker_id')::UUID
         OR abs(v_perna.stake - (v_elem->>'stake')::NUMERIC) > 0.001
         OR abs(v_perna.odd - (v_elem->>'odd')::NUMERIC) > 0.001
         OR v_perna.selecao IS DISTINCT FROM (v_elem->>'selecao')
         OR COALESCE(v_perna.selecao_livre, '') IS DISTINCT FROM COALESCE(v_elem->>'selecao_livre', '')
      THEN
        PERFORM editar_perna_surebet_atomica(
          p_perna_id := v_perna_id,
          p_new_stake := CASE WHEN abs(v_perna.stake - (v_elem->>'stake')::NUMERIC) > 0.001 THEN (v_elem->>'stake')::NUMERIC ELSE NULL END,
          p_new_odd := CASE WHEN abs(v_perna.odd - (v_elem->>'odd')::NUMERIC) > 0.001 THEN (v_elem->>'odd')::NUMERIC ELSE NULL END,
          p_new_bookmaker_id := CASE WHEN v_perna.bookmaker_id != (v_elem->>'bookmaker_id')::UUID THEN (v_elem->>'bookmaker_id')::UUID ELSE NULL END,
          p_new_selecao := CASE WHEN v_perna.selecao IS DISTINCT FROM (v_elem->>'selecao') THEN (v_elem->>'selecao') ELSE NULL END,
          p_new_selecao_livre := CASE WHEN COALESCE(v_perna.selecao_livre, '') IS DISTINCT FROM COALESCE(v_elem->>'selecao_livre', '') THEN (v_elem->>'selecao_livre') ELSE NULL END
        );
        v_edited_count := v_edited_count + 1;
      END IF;
      
      -- Update ordem and fonte_saldo (lightweight, no financial impact)
      UPDATE apostas_pernas SET 
        ordem = v_ordem,
        fonte_saldo = COALESCE(v_elem->>'fonte_saldo', fonte_saldo)
      WHERE id = v_perna_id;
      
    ELSE
      -- ===== NEW perna: insert + create STAKE event =====
      INSERT INTO apostas_pernas (
        aposta_id, bookmaker_id, stake, odd, moeda, selecao, selecao_livre,
        ordem, fonte_saldo, cotacao_snapshot, stake_brl_referencia
      ) VALUES (
        p_aposta_id,
        (v_elem->>'bookmaker_id')::UUID,
        (v_elem->>'stake')::NUMERIC,
        (v_elem->>'odd')::NUMERIC,
        COALESCE(v_elem->>'moeda', 'BRL'),
        v_elem->>'selecao',
        v_elem->>'selecao_livre',
        v_ordem,
        COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        (v_elem->>'cotacao_snapshot')::NUMERIC,
        (v_elem->>'stake_brl_referencia')::NUMERIC
      ) RETURNING id INTO v_perna_id;
      
      -- Create STAKE financial event (negative = debit)
      INSERT INTO financial_events (
        workspace_id, bookmaker_id, tipo_evento, tipo_uso, valor, moeda,
        aposta_id, idempotency_key, descricao
      ) VALUES (
        v_workspace_id,
        (v_elem->>'bookmaker_id')::UUID,
        'STAKE',
        CASE WHEN COALESCE(v_elem->>'fonte_saldo', 'REAL') = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
        -(v_elem->>'stake')::NUMERIC,
        COALESCE(v_elem->>'moeda', 'BRL'),
        p_aposta_id,
        'stake_' || v_perna_id::TEXT || '_edit_add',
        'Stake nova perna (edição atômica)'
      );
      
      v_new_count := v_new_count + 1;
    END IF;
  END LOOP;
  
  -- 7. Update parent record
  UPDATE apostas_unificada SET
    data_aposta = COALESCE(p_data_aposta::TIMESTAMPTZ, data_aposta),
    evento = COALESCE(p_evento, evento),
    esporte = COALESCE(p_esporte, esporte),
    mercado = COALESCE(p_mercado, mercado),
    modelo = COALESCE(p_modelo, modelo),
    estrategia = COALESCE(p_estrategia, estrategia),
    contexto_operacional = COALESCE(p_contexto, contexto_operacional),
    stake_total = COALESCE(p_stake_total, stake_total),
    stake_consolidado = COALESCE(p_stake_consolidado, stake_consolidado),
    lucro_esperado = COALESCE(p_lucro_esperado, lucro_esperado),
    roi_esperado = COALESCE(p_roi_esperado, roi_esperado),
    lucro_prejuizo = p_lucro_prejuizo,
    pl_consolidado = p_lucro_prejuizo,
    roi_real = p_roi_real,
    status = COALESCE(p_status, status),
    resultado = p_resultado,
    updated_at = now()
  WHERE id = p_aposta_id;
  
  -- 8. Refresh pernas JSON snapshot in parent (for backward compat)
  UPDATE apostas_unificada SET pernas = (
    SELECT jsonb_agg(jsonb_build_object(
      'selecao', p.selecao,
      'selecao_livre', p.selecao_livre,
      'bookmaker_id', p.bookmaker_id,
      'moeda', p.moeda,
      'odd', p.odd,
      'stake', p.stake,
      'resultado', p.resultado,
      'lucro_prejuizo', p.lucro_prejuizo,
      'gerou_freebet', p.gerou_freebet,
      'valor_freebet_gerada', p.valor_freebet_gerada
    ) ORDER BY p.ordem)
    FROM apostas_pernas p WHERE p.aposta_id = p_aposta_id
  ) WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'edited', v_edited_count,
    'inserted', v_new_count,
    'deleted', v_deleted_count,
    'total_pernas', v_ordem
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
