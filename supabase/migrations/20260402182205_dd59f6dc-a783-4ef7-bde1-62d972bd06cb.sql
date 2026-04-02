
CREATE OR REPLACE FUNCTION editar_surebet_completa_v1(
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
)
RETURNS JSONB
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

    IF v_id_text IS NOT NULL AND v_id_text != '' THEN
      v_perna_id := v_id_text::UUID;

      -- Existing perna: check if changes needed
      SELECT * INTO v_perna FROM apostas_pernas WHERE id = v_perna_id;

      IF FOUND THEN
        -- Check if any field actually changed (using 0.00001 threshold for precision)
        IF abs(v_perna.stake - (v_elem->>'stake')::NUMERIC) > 0.00001
          OR abs(v_perna.odd - (v_elem->>'odd')::NUMERIC) > 0.00001
          OR v_perna.bookmaker_id != (v_elem->>'bookmaker_id')::UUID
          OR v_perna.selecao IS DISTINCT FROM (v_elem->>'selecao')
          OR COALESCE(v_perna.selecao_livre, '') IS DISTINCT FROM COALESCE(v_elem->>'selecao_livre', '')
       THEN
         PERFORM editar_perna_surebet_atomica(
           p_perna_id := v_perna_id,
           p_new_stake := CASE WHEN abs(v_perna.stake - (v_elem->>'stake')::NUMERIC) > 0.00001 THEN (v_elem->>'stake')::NUMERIC ELSE NULL END,
           p_new_odd := CASE WHEN abs(v_perna.odd - (v_elem->>'odd')::NUMERIC) > 0.00001 THEN (v_elem->>'odd')::NUMERIC ELSE NULL END,
           p_new_bookmaker_id := CASE WHEN v_perna.bookmaker_id != (v_elem->>'bookmaker_id')::UUID THEN (v_elem->>'bookmaker_id')::UUID ELSE NULL END,
           p_new_selecao := CASE WHEN v_perna.selecao IS DISTINCT FROM (v_elem->>'selecao') THEN (v_elem->>'selecao') ELSE NULL END,
           p_new_selecao_livre := CASE WHEN COALESCE(v_perna.selecao_livre, '') IS DISTINCT FROM COALESCE(v_elem->>'selecao_livre', '') THEN (v_elem->>'selecao_livre') ELSE NULL END
         );
         v_edited_count := v_edited_count + 1;
       END IF;

       -- Always update ordem and fonte_saldo
       UPDATE apostas_pernas SET
         ordem = v_ordem,
         fonte_saldo = COALESCE(v_elem->>'fonte_saldo', fonte_saldo)
       WHERE id = v_perna_id;

     ELSE
       -- ID provided but not found in DB - treat as new
       v_perna_id := NULL;
       v_id_text := NULL;
     END IF;
    END IF;

    -- New perna (no ID or ID not found)
    IF v_id_text IS NULL OR v_id_text = '' THEN
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
        CASE WHEN v_elem->>'cotacao_snapshot' IS NOT NULL THEN (v_elem->>'cotacao_snapshot')::NUMERIC ELSE NULL END,
        CASE WHEN v_elem->>'stake_brl_referencia' IS NOT NULL THEN (v_elem->>'stake_brl_referencia')::NUMERIC ELSE NULL END
      );

      -- Generate STAKE financial event for new perna
      INSERT INTO financial_events (
        workspace_id, bookmaker_id, event_type, amount, currency, reference_type, reference_id,
        idempotency_key, description, project_id
      ) VALUES (
        v_workspace_id,
        (v_elem->>'bookmaker_id')::UUID,
        'STAKE',
        -(v_elem->>'stake')::NUMERIC,
        COALESCE(v_elem->>'moeda', 'BRL'),
        'APOSTA_PERNA',
        (SELECT id FROM apostas_pernas WHERE aposta_id = p_aposta_id AND ordem = v_ordem LIMIT 1),
        'stake_perna_' || p_aposta_id || '_new_' || v_ordem || '_' || extract(epoch from now()),
        'Stake nova perna (edição)',
        v_aposta.projeto_id
      );

      v_new_count := v_new_count + 1;
    END IF;
  END LOOP;

  -- 7. Update parent record
  UPDATE apostas_unificada SET
    evento = COALESCE(p_evento, evento),
    esporte = COALESCE(p_esporte, esporte),
    mercado = COALESCE(p_mercado, mercado),
    modelo = COALESCE(p_modelo, modelo),
    estrategia = COALESCE(p_estrategia, estrategia),
    contexto_operacional = COALESCE(p_contexto, contexto_operacional),
    data_aposta = CASE 
      WHEN p_data_aposta IS NOT NULL THEN p_data_aposta::timestamptz 
      ELSE data_aposta 
    END,
    stake_total = COALESCE(p_stake_total, stake_total),
    stake_consolidado = COALESCE(p_stake_consolidado, stake_consolidado),
    lucro_esperado = COALESCE(p_lucro_esperado, lucro_esperado),
    roi_esperado = COALESCE(p_roi_esperado, roi_esperado),
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, lucro_prejuizo),
    roi_real = COALESCE(p_roi_real, roi_real),
    status = COALESCE(p_status, status),
    resultado = COALESCE(p_resultado, resultado),
    updated_at = now()
  WHERE id = p_aposta_id;

  -- 8. Return summary with updated pernas
  RETURN jsonb_build_object(
    'success', true,
    'edited', v_edited_count,
    'deleted', v_deleted_count,
    'created', v_new_count,
    'pernas', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'bookmaker_id', p.bookmaker_id,
        'selecao', p.selecao,
        'selecao_livre', p.selecao_livre,
        'odd', p.odd,
        'stake', p.stake,
        'resultado', p.resultado,
        'lucro_prejuizo', p.lucro_prejuizo,
        'gerou_freebet', p.gerou_freebet,
        'valor_freebet_gerada', p.valor_freebet_gerada
      ) ORDER BY p.ordem)
      FROM apostas_pernas p WHERE p.aposta_id = p_aposta_id
    )
  );
END;
$$;
