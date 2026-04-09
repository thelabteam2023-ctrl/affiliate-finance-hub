
-- ==========================================================
-- FIX: Remove double-counted FX events from retrofix
-- The deposit already uses the confirmed value (post-FX).
-- GANHO_CAMBIAL / PERDA_CAMBIAL ledger entries are informational
-- and must NOT generate additional financial_events.
-- ==========================================================

-- Step 1: Delete the 100 retrofix FX financial_events
DELETE FROM financial_events
WHERE (idempotency_key LIKE 'ledger_ganho_cambial_%' OR idempotency_key LIKE 'ledger_perda_cambial_%')
  AND (metadata->>'retrofix')::boolean = true;

-- Step 2: Recalculate saldo_atual for all affected bookmakers
-- Using a CTE to compute the correct sum from remaining events
WITH correct_balances AS (
  SELECT 
    bookmaker_id,
    COALESCE(SUM(valor) FILTER (WHERE tipo_uso = 'NORMAL'), 0) AS saldo_normal,
    COALESCE(SUM(valor) FILTER (WHERE tipo_uso = 'FREEBET'), 0) AS saldo_freebet
  FROM financial_events
  WHERE bookmaker_id IN (
    SELECT DISTINCT bookmaker_id FROM bookmakers 
    WHERE workspace_id = 'feee9758-a7f4-474c-b2b1-679b66ec1cd9'
  )
  GROUP BY bookmaker_id
)
UPDATE bookmakers b
SET 
  saldo_atual = COALESCE(cb.saldo_normal, 0),
  saldo_freebet = COALESCE(cb.saldo_freebet, 0),
  updated_at = now()
FROM correct_balances cb
WHERE b.id = cb.bookmaker_id
  AND (b.saldo_atual != COALESCE(cb.saldo_normal, 0) OR b.saldo_freebet != COALESCE(cb.saldo_freebet, 0));

-- Step 3: Update the trigger to skip FX events
-- GANHO_CAMBIAL and PERDA_CAMBIAL are informational only - the deposit 
-- already contains the confirmed (post-FX) value
CREATE OR REPLACE FUNCTION fn_cash_ledger_generate_financial_events()
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
BEGIN
  -- Skip if already processed
  IF NEW.financial_events_generated = TRUE THEN
    RETURN NEW;
  END IF;

  -- ============================================================
  -- SKIP: FX events are informational only.
  -- The deposit already reflects the confirmed (post-FX) value.
  -- Generating a financial_event would double-count the FX delta.
  -- ============================================================
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

    -- === WITHDRAWALS ===
    WHEN 'SAQUE' THEN
      v_tipo_evento := 'SAQUE';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Saque via cash_ledger #' || NEW.id);
      v_idempotency_key := 'ledger_saque_' || NEW.id;

    -- === TRANSFERS ===
    WHEN 'TRANSFERENCIA' THEN
      -- For transfers, we need to handle origin and destination
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        -- Debit from origin
        INSERT INTO financial_events (
          id, bookmaker_id, workspace_id, user_id,
          tipo_evento, tipo_uso, valor, moeda,
          idempotency_key, descricao, metadata, processed_at
        ) VALUES (
          gen_random_uuid(), NEW.origem_bookmaker_id, NEW.workspace_id, NEW.user_id,
          'TRANSFERENCIA_SAIDA', 'NORMAL', -1 * ABS(NEW.valor), NEW.moeda,
          'ledger_transfer_out_' || NEW.id,
          COALESCE(NEW.descricao, 'Transferência saída #' || NEW.id),
          jsonb_build_object('ledger_id', NEW.id), now()
        );
      END IF;
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        -- Credit to destination
        INSERT INTO financial_events (
          id, bookmaker_id, workspace_id, user_id,
          tipo_evento, tipo_uso, valor, moeda,
          idempotency_key, descricao, metadata, processed_at
        ) VALUES (
          gen_random_uuid(), NEW.destino_bookmaker_id, NEW.workspace_id, NEW.user_id,
          'TRANSFERENCIA_ENTRADA', 'NORMAL', ABS(COALESCE(NEW.valor_destino, NEW.valor)),
          COALESCE(NEW.moeda_destino, NEW.moeda),
          'ledger_transfer_in_' || NEW.id,
          COALESCE(NEW.descricao, 'Transferência entrada #' || NEW.id),
          jsonb_build_object('ledger_id', NEW.id), now()
        );
      END IF;
      NEW.financial_events_generated := TRUE;
      RETURN NEW;

    -- === MANUAL ADJUSTMENTS ===
    WHEN 'AJUSTE_SALDO' THEN
      v_tipo_evento := 'AJUSTE_MANUAL';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Ajuste manual #' || NEW.id);
      v_idempotency_key := 'ledger_ajuste_' || NEW.id;

    -- === RECONCILIATION (SET) ===
    WHEN 'AJUSTE_RECONCILIACAO' THEN
      v_tipo_evento := 'AJUSTE_MANUAL';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Reconciliação de saldo #' || NEW.id);
      v_idempotency_key := 'ledger_reconciliacao_' || NEW.id;

    -- === BONUS ===
    WHEN 'BONUS_CREDITADO' THEN
      v_tipo_evento := 'BONUS';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Crédito de bônus #' || NEW.id);
      v_idempotency_key := 'ledger_bonus_' || NEW.id;

    -- === BONUS REVERSAL ===
    WHEN 'BONUS_ESTORNO' THEN
      v_tipo_evento := 'BONUS_ESTORNO';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Estorno de bônus #' || NEW.id);
      v_idempotency_key := 'ledger_bonus_estorno_' || NEW.id;

    -- === CASHBACK ===
    WHEN 'CASHBACK' THEN
      v_tipo_evento := 'CASHBACK';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Cashback #' || NEW.id);
      v_idempotency_key := 'ledger_cashback_' || NEW.id;

    -- === OPERATIONAL LOSSES ===
    WHEN 'PERDA_OPERACIONAL' THEN
      v_tipo_evento := 'PERDA_OPERACIONAL';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Perda operacional #' || NEW.id);
      v_idempotency_key := 'ledger_perda_op_' || NEW.id;

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

    -- === FREEBET CREDIT ===
    WHEN 'FREEBET_CREDITADA' THEN
      v_tipo_evento := 'FREEBET_CREDIT';
      v_tipo_uso := 'FREEBET';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Crédito freebet #' || NEW.id);
      v_idempotency_key := 'ledger_freebet_' || NEW.id;

    -- === INVESTMENT OPERATIONS ===
    WHEN 'APORTE_FINANCEIRO' THEN
      -- Investment operations don't impact bookmaker balance
      NEW.financial_events_generated := TRUE;
      RETURN NEW;

    WHEN 'RESGATE_FINANCEIRO' THEN
      NEW.financial_events_generated := TRUE;
      RETURN NEW;

    -- === DEFAULT: Unknown type - mark as processed but don't generate ===
    ELSE
      NEW.financial_events_generated := TRUE;
      RETURN NEW;
  END CASE;

  -- Insert the financial event
  INSERT INTO financial_events (
    id, bookmaker_id, workspace_id, user_id,
    tipo_evento, tipo_uso, valor, moeda,
    idempotency_key, descricao, metadata, processed_at
  ) VALUES (
    gen_random_uuid(), v_bookmaker_id, NEW.workspace_id, NEW.user_id,
    v_tipo_evento, v_tipo_uso, v_valor, NEW.moeda,
    v_idempotency_key, v_descricao,
    jsonb_build_object('ledger_id', NEW.id),
    now()
  );

  NEW.financial_events_generated := TRUE;
  RETURN NEW;
END;
$$;

-- Step 4: Mark FX ledger entries as not needing financial events
-- (they already have financial_events_generated = true, just confirming)
UPDATE cash_ledger
SET financial_events_generated = TRUE
WHERE tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL')
  AND financial_events_generated IS DISTINCT FROM TRUE;
