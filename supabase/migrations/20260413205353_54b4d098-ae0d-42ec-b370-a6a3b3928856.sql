
CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bookmaker_id UUID;
  v_valor NUMERIC(15,2);
  v_tipo_evento TEXT;
  v_tipo_uso TEXT := 'NORMAL';
  v_descricao TEXT;
  v_idempotency_key TEXT;
  v_allow_negative BOOLEAN := false;
  v_event_scope TEXT := 'REAL';
BEGIN
  -- Skip if already processed
  IF NEW.financial_events_generated = TRUE THEN
    RETURN NEW;
  END IF;

  -- Skip non-confirmed
  IF NEW.status NOT IN ('CONFIRMADO') THEN
    RETURN NEW;
  END IF;

  -- FX events: generate financial_event for balance sync
  IF NEW.tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL') THEN
    v_bookmaker_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
    
    IF v_bookmaker_id IS NULL THEN
      NEW.financial_events_generated := TRUE;
      RETURN NEW;
    END IF;

    v_tipo_evento := 'AJUSTE';
    v_allow_negative := true;
    
    IF NEW.tipo_transacao = 'GANHO_CAMBIAL' THEN
      v_valor := ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Ganho cambial #' || NEW.id);
      v_idempotency_key := 'ledger_ganho_cambial_' || NEW.id;
    ELSE
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Perda cambial #' || NEW.id);
      v_idempotency_key := 'ledger_perda_cambial_' || NEW.id;
    END IF;

    INSERT INTO financial_events (
      id, bookmaker_id, workspace_id, created_by,
      tipo_evento, tipo_uso, valor, moeda,
      idempotency_key, descricao, metadata, processed_at,
      allow_negative, event_scope
    ) VALUES (
      gen_random_uuid(), v_bookmaker_id, NEW.workspace_id, NEW.user_id,
      v_tipo_evento, v_tipo_uso, v_valor, NEW.moeda,
      v_idempotency_key, v_descricao,
      jsonb_build_object('ledger_id', NEW.id, 'tipo_fx', NEW.tipo_transacao),
      now(), v_allow_negative, 'REAL'
    );

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

    -- === VIRTUAL DEPOSIT (project linking) ===
    WHEN 'DEPOSITO_VIRTUAL' THEN
      v_tipo_evento := 'DEPOSITO';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Depósito virtual (vínculo) #' || NEW.id);
      v_idempotency_key := 'ledger_dep_virtual_' || NEW.id;
      v_event_scope := 'VIRTUAL';

    -- === VIRTUAL WITHDRAWAL (project unlinking) ===
    WHEN 'SAQUE_VIRTUAL' THEN
      v_tipo_evento := 'SAQUE';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Saque virtual (desvínculo) #' || NEW.id);
      v_idempotency_key := 'ledger_saque_virtual_' || NEW.id;
      v_event_scope := 'VIRTUAL';
      v_allow_negative := true;

    -- === TRANSFERS ===
    WHEN 'TRANSFERENCIA' THEN
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        INSERT INTO financial_events (
          id, bookmaker_id, workspace_id, created_by,
          tipo_evento, tipo_uso, valor, moeda,
          idempotency_key, descricao, metadata, processed_at,
          allow_negative, event_scope
        ) VALUES (
          gen_random_uuid(), NEW.origem_bookmaker_id, NEW.workspace_id, NEW.user_id,
          'TRANSFERENCIA_SAIDA', 'NORMAL', -1 * ABS(NEW.valor), NEW.moeda,
          'ledger_transfer_out_' || NEW.id,
          COALESCE(NEW.descricao, 'Transferência saída #' || NEW.id),
          jsonb_build_object('ledger_id', NEW.id), now(),
          true, 'REAL'
        );
      END IF;
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        INSERT INTO financial_events (
          id, bookmaker_id, workspace_id, created_by,
          tipo_evento, tipo_uso, valor, moeda,
          idempotency_key, descricao, metadata, processed_at,
          allow_negative, event_scope
        ) VALUES (
          gen_random_uuid(), NEW.destino_bookmaker_id, NEW.workspace_id, NEW.user_id,
          'TRANSFERENCIA_ENTRADA', 'NORMAL', ABS(COALESCE(NEW.valor_destino, NEW.valor)),
          COALESCE(NEW.moeda_destino, NEW.moeda),
          'ledger_transfer_in_' || NEW.id,
          COALESCE(NEW.descricao, 'Transferência entrada #' || NEW.id),
          jsonb_build_object('ledger_id', NEW.id), now(),
          false, 'REAL'
        );
      END IF;
      NEW.financial_events_generated := TRUE;
      RETURN NEW;

    -- === MANUAL ADJUSTMENTS (allow negative) ===
    WHEN 'AJUSTE_SALDO' THEN
      v_tipo_evento := 'AJUSTE';
      v_valor := CASE 
        WHEN NEW.ajuste_direcao = 'SAIDA' THEN -1 * ABS(NEW.valor)
        ELSE ABS(NEW.valor)
      END;
      v_descricao := COALESCE(NEW.descricao, 'Ajuste manual #' || NEW.id);
      v_idempotency_key := 'ledger_ajuste_' || NEW.id;
      v_allow_negative := true;

    -- === RECONCILIATION (allow negative) ===
    WHEN 'AJUSTE_RECONCILIACAO' THEN
      v_tipo_evento := 'AJUSTE';
      v_valor := CASE 
        WHEN NEW.ajuste_direcao = 'SAIDA' THEN -1 * ABS(NEW.valor)
        ELSE ABS(NEW.valor)
      END;
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

    -- === OPERATIONAL LOSS ===
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

    -- === FREE SPINS ===
    WHEN 'GIRO_GRATIS' THEN
      v_tipo_evento := 'GIRO_GRATIS';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Giro grátis #' || NEW.id);
      v_idempotency_key := 'ledger_giro_' || NEW.id;

    -- === FREE SPIN REVERSAL ===
    WHEN 'GIRO_GRATIS_ESTORNO' THEN
      v_tipo_evento := 'GIRO_GRATIS_ESTORNO';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Estorno de giro grátis #' || NEW.id);
      v_idempotency_key := 'ledger_giro_estorno_' || NEW.id;
      v_allow_negative := true;

    -- === CASHBACK ===
    WHEN 'CASHBACK' THEN
      v_tipo_evento := 'CASHBACK';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Cashback #' || NEW.id);
      v_idempotency_key := 'ledger_cashback_' || NEW.id;

    -- === CASHBACK REVERSAL ===
    WHEN 'CASHBACK_ESTORNO' THEN
      v_tipo_evento := 'CASHBACK_ESTORNO';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Estorno de cashback #' || NEW.id);
      v_idempotency_key := 'ledger_cashback_estorno_' || NEW.id;
      v_allow_negative := true;

    ELSE
      RAISE EXCEPTION 'fn_cash_ledger_generate_financial_events: tipo_transacao desconhecido: %', NEW.tipo_transacao;
  END CASE;

  -- Insert the financial event
  INSERT INTO financial_events (
    id, bookmaker_id, workspace_id, created_by,
    tipo_evento, tipo_uso, valor, moeda,
    idempotency_key, descricao, metadata, processed_at,
    allow_negative, event_scope
  ) VALUES (
    gen_random_uuid(), v_bookmaker_id, NEW.workspace_id, NEW.user_id,
    v_tipo_evento, v_tipo_uso, v_valor, NEW.moeda,
    v_idempotency_key, v_descricao,
    jsonb_build_object('ledger_id', NEW.id), now(),
    v_allow_negative, v_event_scope
  );

  NEW.financial_events_generated := TRUE;
  RETURN NEW;
END;
$function$;
