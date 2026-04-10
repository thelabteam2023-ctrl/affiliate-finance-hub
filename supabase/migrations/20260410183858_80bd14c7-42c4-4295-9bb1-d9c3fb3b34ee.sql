
-- =============================================
-- FIX 1: fn_cash_ledger_generate_financial_events
-- Replace user_id → created_by in all INSERTs
-- =============================================
CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker_id UUID;
  v_valor NUMERIC(15,2);
  v_tipo_evento TEXT;
  v_tipo_uso TEXT := 'NORMAL';
  v_descricao TEXT;
  v_idempotency_key TEXT;
  v_allow_negative BOOLEAN := false;
BEGIN
  -- Skip if already processed
  IF NEW.financial_events_generated = TRUE THEN
    RETURN NEW;
  END IF;

  -- Skip FX events
  IF NEW.tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL') THEN
    NEW.financial_events_generated := TRUE;
    RETURN NEW;
  END IF;

  -- Determine bookmaker_id
  v_bookmaker_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
  
  -- Skip if no bookmaker involved
  IF v_bookmaker_id IS NULL THEN
    NEW.financial_events_generated := TRUE;
    RETURN NEW;
  END IF;

  -- Map transaction type to event type and calculate value
  CASE NEW.tipo_transacao
    -- === DEPOSITS ===
    WHEN 'DEPOSITO' THEN
      v_tipo_evento := 'DEPOSITO';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Depósito via cash_ledger #' || NEW.id);
      v_idempotency_key := 'ledger_deposit_' || NEW.id;

    -- === WITHDRAWALS (allow negative) ===
    WHEN 'SAQUE' THEN
      v_tipo_evento := 'SAQUE';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Saque via cash_ledger #' || NEW.id);
      v_idempotency_key := 'ledger_saque_' || NEW.id;
      v_allow_negative := true;

    -- === TRANSFERS ===
    WHEN 'TRANSFERENCIA' THEN
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        INSERT INTO financial_events (
          id, bookmaker_id, workspace_id, created_by,
          tipo_evento, tipo_uso, valor, moeda,
          idempotency_key, descricao, metadata, processed_at,
          allow_negative
        ) VALUES (
          gen_random_uuid(), NEW.origem_bookmaker_id, NEW.workspace_id, NEW.user_id,
          'TRANSFERENCIA_SAIDA', 'NORMAL', -1 * ABS(NEW.valor), NEW.moeda,
          'ledger_transfer_out_' || NEW.id,
          COALESCE(NEW.descricao, 'Transferência saída #' || NEW.id),
          jsonb_build_object('ledger_id', NEW.id), now(),
          true
        );
      END IF;
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        INSERT INTO financial_events (
          id, bookmaker_id, workspace_id, created_by,
          tipo_evento, tipo_uso, valor, moeda,
          idempotency_key, descricao, metadata, processed_at,
          allow_negative
        ) VALUES (
          gen_random_uuid(), NEW.destino_bookmaker_id, NEW.workspace_id, NEW.user_id,
          'TRANSFERENCIA_ENTRADA', 'NORMAL', ABS(COALESCE(NEW.valor_destino, NEW.valor)),
          COALESCE(NEW.moeda_destino, NEW.moeda),
          'ledger_transfer_in_' || NEW.id,
          COALESCE(NEW.descricao, 'Transferência entrada #' || NEW.id),
          jsonb_build_object('ledger_id', NEW.id), now(),
          false
        );
      END IF;
      NEW.financial_events_generated := TRUE;
      RETURN NEW;

    -- === MANUAL ADJUSTMENTS (allow negative) ===
    WHEN 'AJUSTE_SALDO' THEN
      v_tipo_evento := 'AJUSTE_MANUAL';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Ajuste manual #' || NEW.id);
      v_idempotency_key := 'ledger_ajuste_' || NEW.id;
      v_allow_negative := true;

    -- === RECONCILIATION (allow negative) ===
    WHEN 'AJUSTE_RECONCILIACAO' THEN
      v_tipo_evento := 'AJUSTE_MANUAL';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Reconciliação de saldo #' || NEW.id);
      v_idempotency_key := 'ledger_reconciliacao_' || NEW.id;
      v_allow_negative := true;

    -- === BONUS ===
    WHEN 'BONUS_CREDITADO' THEN
      v_tipo_evento := 'BONUS';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Crédito de bônus #' || NEW.id);
      v_idempotency_key := 'ledger_bonus_' || NEW.id;

    -- === BONUS REVERSAL (allow negative) ===
    WHEN 'BONUS_ESTORNO' THEN
      v_tipo_evento := 'BONUS_ESTORNO';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Estorno de bônus #' || NEW.id);
      v_idempotency_key := 'ledger_bonus_estorno_' || NEW.id;
      v_allow_negative := true;

    -- === CASHBACK ===
    WHEN 'CASHBACK' THEN
      v_tipo_evento := 'CASHBACK';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Cashback #' || NEW.id);
      v_idempotency_key := 'ledger_cashback_' || NEW.id;

    -- === OPERATIONAL LOSSES (allow negative) ===
    WHEN 'PERDA_OPERACIONAL' THEN
      v_tipo_evento := 'PERDA_OPERACIONAL';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Perda operacional #' || NEW.id);
      v_idempotency_key := 'ledger_perda_op_' || NEW.id;
      v_allow_negative := true;

    -- === LOSS REVERSAL ===
    WHEN 'PERDA_REVERSAO' THEN
      v_tipo_evento := 'PERDA_REVERSAO';
      v_valor := ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Reversão de perda #' || NEW.id);
      v_idempotency_key := 'ledger_perda_rev_' || NEW.id;

    -- === LEGACY BET RESULTS ===
    WHEN 'APOSTA_GREEN' THEN
      v_tipo_evento := 'PAYOUT';
      v_valor := ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Payout aposta green #' || NEW.id);
      v_idempotency_key := 'ledger_aposta_green_' || NEW.id;

    WHEN 'APOSTA_REVERSAO' THEN
      v_tipo_evento := 'REVERSAL';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Reversão de aposta #' || NEW.id);
      v_idempotency_key := 'ledger_aposta_rev_' || NEW.id;
      v_allow_negative := true;

    -- === FREEBET CREDIT ===
    WHEN 'FREEBET_CREDITADA' THEN
      v_tipo_evento := 'FREEBET_CREDIT';
      v_tipo_uso := 'FREEBET';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Crédito freebet #' || NEW.id);
      v_idempotency_key := 'ledger_freebet_' || NEW.id;

    -- === INVESTMENT OPERATIONS ===
    WHEN 'APORTE_FINANCEIRO' THEN
      NEW.financial_events_generated := TRUE;
      RETURN NEW;

    WHEN 'RESGATE_FINANCEIRO' THEN
      NEW.financial_events_generated := TRUE;
      RETURN NEW;

    -- === DEFAULT ===
    ELSE
      NEW.financial_events_generated := TRUE;
      RETURN NEW;
  END CASE;

  -- Insert the financial event with allow_negative flag
  INSERT INTO financial_events (
    id, bookmaker_id, workspace_id, created_by,
    tipo_evento, tipo_uso, valor, moeda,
    idempotency_key, descricao, metadata, processed_at,
    allow_negative
  ) VALUES (
    gen_random_uuid(), v_bookmaker_id, NEW.workspace_id, NEW.user_id,
    v_tipo_evento, v_tipo_uso, v_valor, NEW.moeda,
    v_idempotency_key, v_descricao,
    jsonb_build_object('ledger_id', NEW.id),
    now(),
    v_allow_negative
  );

  NEW.financial_events_generated := TRUE;
  RETURN NEW;
END;
$$;


-- =============================================
-- FIX 2: editar_surebet_completa_v1
-- Replace legacy column names with current schema
-- event_type→tipo_evento, amount→valor, currency→moeda,
-- description→descricao, remove project_id/reference_type/reference_id,
-- add created_by, aposta_id, metadata
-- =============================================
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
  v_perna_stake NUMERIC;
  v_perna_stake_real NUMERIC;
  v_perna_stake_freebet NUMERIC;
BEGIN
  -- 1. Lock parent record
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;

  v_workspace_id := v_aposta.workspace_id;

  -- 2. Get existing perna IDs
  SELECT COALESCE(array_agg(id), '{}') INTO v_existing_ids
  FROM apostas_pernas WHERE aposta_id = p_aposta_id;

  -- 3. Collect input IDs
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_id_text := v_elem->>'id';
    IF v_id_text IS NOT NULL AND v_id_text != '' THEN
      v_input_ids := array_append(v_input_ids, v_id_text::UUID);
    END IF;
  END LOOP;

  -- 4. Determine pernas to delete
  SELECT COALESCE(array_agg(existing_id), '{}') INTO v_to_delete
  FROM unnest(v_existing_ids) AS existing_id
  WHERE existing_id != ALL(v_input_ids);

  -- 5. Delete removed pernas
  IF array_length(v_to_delete, 1) > 0 THEN
    FOR v_perna_id IN SELECT unnest(v_to_delete) LOOP
      PERFORM deletar_perna_surebet_v1(v_perna_id);
      v_deleted_count := v_deleted_count + 1;
    END LOOP;
  END IF;

  -- 6. Process each input perna
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_ordem := v_ordem + 1;
    v_id_text := v_elem->>'id';

    IF v_id_text IS NOT NULL AND v_id_text != '' THEN
      v_perna_id := v_id_text::UUID;

      SELECT * INTO v_perna FROM apostas_pernas WHERE id = v_perna_id;

      IF FOUND THEN
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

       UPDATE apostas_pernas SET
         ordem = v_ordem,
         fonte_saldo = COALESCE(v_elem->>'fonte_saldo', fonte_saldo)
       WHERE id = v_perna_id;

     ELSE
       v_perna_id := NULL;
       v_id_text := NULL;
     END IF;
    END IF;

    -- New perna (no ID or ID not found)
    IF v_id_text IS NULL OR v_id_text = '' THEN
      -- Calculate stake_real/stake_freebet for new perna
      v_perna_stake := (v_elem->>'stake')::NUMERIC;
      IF COALESCE(v_elem->>'fonte_saldo', 'REAL') = 'FREEBET' THEN
        v_perna_stake_real := 0;
        v_perna_stake_freebet := v_perna_stake;
      ELSE
        v_perna_stake_real := v_perna_stake;
        v_perna_stake_freebet := 0;
      END IF;

      INSERT INTO apostas_pernas (
        aposta_id, bookmaker_id, stake, stake_real, stake_freebet, odd, moeda, selecao, selecao_livre,
        ordem, fonte_saldo, cotacao_snapshot, stake_brl_referencia
      ) VALUES (
        p_aposta_id,
        (v_elem->>'bookmaker_id')::UUID,
        v_perna_stake,
        v_perna_stake_real,
        v_perna_stake_freebet,
        (v_elem->>'odd')::NUMERIC,
        COALESCE(v_elem->>'moeda', 'BRL'),
        v_elem->>'selecao',
        v_elem->>'selecao_livre',
        v_ordem,
        COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        CASE WHEN v_elem->>'cotacao_snapshot' IS NOT NULL THEN (v_elem->>'cotacao_snapshot')::NUMERIC ELSE NULL END,
        CASE WHEN v_elem->>'stake_brl_referencia' IS NOT NULL THEN (v_elem->>'stake_brl_referencia')::NUMERIC ELSE NULL END
      );

      -- Generate STAKE financial event for new perna (FIXED column names)
      INSERT INTO financial_events (
        bookmaker_id, workspace_id, aposta_id, created_by,
        tipo_evento, tipo_uso, valor, moeda,
        idempotency_key, descricao, metadata
      ) VALUES (
        (v_elem->>'bookmaker_id')::UUID,
        v_workspace_id,
        p_aposta_id,
        v_aposta.user_id,
        'STAKE', 'NORMAL',
        -v_perna_stake,
        COALESCE(v_elem->>'moeda', 'BRL'),
        'stake_perna_' || p_aposta_id || '_new_' || v_ordem || '_' || extract(epoch from now()),
        'Stake nova perna (edição)',
        jsonb_build_object('perna_ordem', v_ordem, 'origem', 'editar_surebet_completa_v1')
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
    stake_real = (SELECT COALESCE(SUM(ap.stake_real), 0) FROM apostas_pernas ap WHERE ap.aposta_id = p_aposta_id),
    stake_freebet = (SELECT COALESCE(SUM(ap.stake_freebet), 0) FROM apostas_pernas ap WHERE ap.aposta_id = p_aposta_id),
    stake_consolidado = COALESCE(p_stake_consolidado, stake_consolidado),
    lucro_esperado = COALESCE(p_lucro_esperado, lucro_esperado),
    roi_esperado = COALESCE(p_roi_esperado, roi_esperado),
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, lucro_prejuizo),
    roi_real = COALESCE(p_roi_real, roi_real),
    status = COALESCE(p_status, status),
    resultado = COALESCE(p_resultado, resultado),
    updated_at = now()
  WHERE id = p_aposta_id;

  -- 8. Return summary
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
        'stake_real', p.stake_real,
        'stake_freebet', p.stake_freebet,
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
