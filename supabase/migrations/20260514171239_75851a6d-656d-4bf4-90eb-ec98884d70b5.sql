-- ============================================================================
-- LEDGER ENGINE V6: STRICT WHITELIST LOGIC
-- ============================================================================

-- 1. Create the corrected function with STRICT WHITELIST
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_v6()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta_real NUMERIC := 0;
  v_delta_freebet NUMERIC := 0;
  v_delta_bonus NUMERIC := 0;
  v_saldo_anterior_real NUMERIC;
  v_saldo_anterior_freebet NUMERIC;
  v_saldo_anterior_bonus NUMERIC;
  v_bookmaker_id UUID;
  v_is_new_scoped BOOLEAN;
BEGIN
  -- ─── SCOPED ACTIVATION CHECK ───
  -- Check if this bookmaker belongs to a project created AFTER this migration (May 14, 2026)
  -- Or if it's a new bookmaker created without a project for now.
  -- For safety, we use the timestamp of this migration.
  
  SELECT (created_at >= '2026-05-14 00:00:00+00') INTO v_is_new_scoped 
  FROM bookmakers WHERE id = COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
  
  -- If it's an "Old World" bookmaker, let V5 handle it (or just return if we want to replace trigger)
  -- But we'll keep both triggers and they will decide which one acts.
  IF NOT COALESCE(v_is_new_scoped, TRUE) THEN
    RETURN NEW;
  END IF;

  -- Logic from here onwards is strictly for "New World" accounts
  
  -- Idempotency
  IF NEW.balance_processed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Only CONFIRMADO impacts balance
  IF NEW.status != 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;

  -- ─── STRICT WHITELIST CASE ───
  CASE NEW.tipo_transacao
    -- BETS
    WHEN 'APOSTA_STAKE' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.debito_real, NEW.valor);
      v_delta_bonus := -COALESCE(NEW.debito_bonus, 0);
      v_delta_freebet := -COALESCE(NEW.debito_freebet, 0);
      
    WHEN 'APOSTA_GREEN', 'APOSTA_MEIO_GREEN' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      
    WHEN 'APOSTA_MEIO_RED' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.debito_real, 0) / 2;
      v_delta_bonus := COALESCE(NEW.debito_bonus, 0) / 2;
      v_delta_freebet := COALESCE(NEW.debito_freebet, 0) / 2;
      
    WHEN 'APOSTA_VOID', 'APOSTA_REEMBOLSO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.debito_real, NEW.valor);
      v_delta_bonus := COALESCE(NEW.debito_bonus, 0);
      v_delta_freebet := COALESCE(NEW.debito_freebet, 0);
      
    WHEN 'APOSTA_REVERSAO' THEN
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.origem_bookmaker_id;
        v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
      ELSIF NEW.destino_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.destino_bookmaker_id;
        v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      END IF;

    -- FREEBETS / BONUS
    WHEN 'FREEBET_CREDITADA', 'FREEBET_ESTORNO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_freebet := COALESCE(NEW.valor_destino, NEW.valor);
      
    WHEN 'FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_freebet := -COALESCE(NEW.valor_origem, NEW.valor);
      
    WHEN 'FREEBET_CONVERTIDA' THEN
      v_bookmaker_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
      v_delta_freebet := -COALESCE(NEW.valor_origem, NEW.valor);
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);

    WHEN 'BONUS_CREDITADO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      
    WHEN 'BONUS_ESTORNO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);

    -- CORE TRANSFERS
    WHEN 'DEPOSITO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      
    WHEN 'SAQUE' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
      
    WHEN 'TRANSFERENCIA', 'TRANSFERENCIA_INTERNA' THEN
      -- Special case: double impact handled inside
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        UPDATE bookmakers SET saldo_atual = saldo_atual - COALESCE(NEW.valor_origem, NEW.valor), updated_at = NOW() WHERE id = NEW.origem_bookmaker_id;
      END IF;
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        UPDATE bookmakers SET saldo_atual = saldo_atual + COALESCE(NEW.valor_destino, NEW.valor), updated_at = NOW() WHERE id = NEW.destino_bookmaker_id;
      END IF;
      NEW.balance_processed_at := NOW();
      RETURN NEW;

    -- ADJUSTMENTS / CASHBACK
    WHEN 'AJUSTE_POSITIVO', 'AJUSTE_SALDO', 'AJUSTE_MANUAL', 'CONCILIACAO', 'GANHO_CAMBIAL', 'CASHBACK_MANUAL', 'CREDITO_CASHBACK', 'GIRO_GRATIS', 'PERDA_REVERSAO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      
    WHEN 'AJUSTE_NEGATIVO', 'PERDA_OPERACIONAL', 'PERDA_CAMBIAL', 'CASHBACK_ESTORNO', 'GIRO_GRATIS_ESTORNO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);

    ELSE
      -- ─── CRITICAL FIX ───
      -- DEPOSITO_VIRTUAL, SAQUE_VIRTUAL, AJUSTE_RECONCILIACAO etc. fall here.
      -- They MUST NOT impact the real balance.
      NEW.balance_processed_at := NOW(); -- Mark as processed but zero impact
      RETURN NEW;
  END CASE;

  -- Apply deltas with lock
  IF v_bookmaker_id IS NOT NULL AND (v_delta_real != 0 OR v_delta_freebet != 0 OR v_delta_bonus != 0) THEN
    SELECT saldo_atual, saldo_freebet, COALESCE(saldo_bonus, 0)
    INTO v_saldo_anterior_real, v_saldo_anterior_freebet, v_saldo_anterior_bonus
    FROM bookmakers WHERE id = v_bookmaker_id FOR UPDATE;
    
    UPDATE bookmakers SET
      saldo_atual = COALESCE(saldo_atual, 0) + v_delta_real,
      saldo_freebet = COALESCE(saldo_freebet, 0) + v_delta_freebet,
      saldo_bonus = COALESCE(saldo_bonus, 0) + v_delta_bonus,
      updated_at = NOW()
    WHERE id = v_bookmaker_id;
    
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo, 
      origem, referencia_tipo, referencia_id, user_id, observacoes
    ) VALUES (
      v_bookmaker_id, NEW.workspace_id, 
      v_saldo_anterior_real, v_saldo_anterior_real + v_delta_real,
      'TRIGGER_V6', NEW.tipo_transacao, NEW.id, NEW.user_id,
      FORMAT('V6_WHITELIST: delta_real=%s', v_delta_real)
    );
  END IF;
  
  NEW.balance_processed_at := NOW();
  RETURN NEW;
END;
$$;

-- 2. Update existing V5 to NOT process new bookmakers (separation of concerns)
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_v5()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta_real NUMERIC := 0;
  v_delta_freebet NUMERIC := 0;
  v_delta_bonus NUMERIC := 0;
  v_saldo_anterior_real NUMERIC;
  v_saldo_anterior_freebet NUMERIC;
  v_saldo_anterior_bonus NUMERIC;
  v_bookmaker_id UUID;
  v_is_new_scoped BOOLEAN;
BEGIN
  -- ─── SCOPED ACTIVATION CHECK ───
  SELECT (created_at >= '2026-05-14 00:00:00+00') INTO v_is_new_scoped 
  FROM bookmakers WHERE id = COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
  
  -- If it's a "New World" bookmaker, let V6 handle it
  IF COALESCE(v_is_new_scoped, FALSE) THEN
    RETURN NEW;
  END IF;

  -- Old logic remains here for legacy accounts...
  -- [Rest of existing V5 logic omitted for brevity in migration SQL but kept in DB]
  -- [Actually, we'll just keep the existing V5 code but wrap it in the IF condition]
  
  IF NEW.balance_processed_at IS NOT NULL OR NEW.status != 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;

  CASE NEW.tipo_transacao
    WHEN 'APOSTA_STAKE' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.debito_real, NEW.valor);
      v_delta_bonus := -COALESCE(NEW.debito_bonus, 0);
      v_delta_freebet := -COALESCE(NEW.debito_freebet, 0);
    WHEN 'APOSTA_GREEN', 'APOSTA_MEIO_GREEN' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
    WHEN 'APOSTA_RED', 'APOSTA_MEIO_RED' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      IF NEW.tipo_transacao = 'APOSTA_MEIO_RED' THEN
        v_delta_real := COALESCE(NEW.debito_real, 0) / 2;
        v_delta_bonus := COALESCE(NEW.debito_bonus, 0) / 2;
        v_delta_freebet := COALESCE(NEW.debito_freebet, 0) / 2;
      END IF;
    WHEN 'APOSTA_VOID', 'APOSTA_REEMBOLSO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.debito_real, NEW.valor);
      v_delta_bonus := COALESCE(NEW.debito_bonus, 0);
      v_delta_freebet := COALESCE(NEW.debito_freebet, 0);
    WHEN 'APOSTA_REVERSAO' THEN
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.origem_bookmaker_id;
        v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
      ELSIF NEW.destino_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.destino_bookmaker_id;
        v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      END IF;
    WHEN 'FREEBET_CREDITADA' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_freebet := COALESCE(NEW.valor_destino, NEW.valor);
    WHEN 'FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_freebet := -COALESCE(NEW.valor_origem, NEW.valor);
    WHEN 'FREEBET_ESTORNO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_freebet := COALESCE(NEW.valor_destino, NEW.valor);
    WHEN 'FREEBET_CONVERTIDA' THEN
      v_bookmaker_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
      v_delta_freebet := -COALESCE(NEW.valor_origem, NEW.valor);
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
    WHEN 'BONUS_CREDITADO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
    WHEN 'BONUS_ESTORNO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
    WHEN 'DEPOSITO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
    WHEN 'SAQUE' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
    WHEN 'TRANSFERENCIA', 'TRANSFERENCIA_INTERNA' THEN
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        UPDATE bookmakers SET saldo_atual = saldo_atual - COALESCE(NEW.valor_origem, NEW.valor), updated_at = NOW() WHERE id = NEW.origem_bookmaker_id;
      END IF;
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        UPDATE bookmakers SET saldo_atual = saldo_atual + COALESCE(NEW.valor_destino, NEW.valor), updated_at = NOW() WHERE id = NEW.destino_bookmaker_id;
      END IF;
      NEW.balance_processed_at := NOW();
      RETURN NEW;
    WHEN 'CASHBACK_MANUAL', 'CREDITO_CASHBACK', 'GIRO_GRATIS' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
    WHEN 'CASHBACK_ESTORNO', 'GIRO_GRATIS_ESTORNO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
    WHEN 'AJUSTE_SALDO', 'AJUSTE_MANUAL', 'AJUSTE_POSITIVO', 'CONCILIACAO', 'GANHO_CAMBIAL' THEN
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.destino_bookmaker_id;
        v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      ELSIF NEW.origem_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.origem_bookmaker_id;
        v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
      END IF;
    WHEN 'AJUSTE_NEGATIVO', 'PERDA_OPERACIONAL', 'PERDA_CAMBIAL' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
    WHEN 'PERDA_REVERSAO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
    ELSE
      -- Generic legacy logic (the bug source)
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.destino_bookmaker_id;
        v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      ELSIF NEW.origem_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.origem_bookmaker_id;
        v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
      END IF;
  END CASE;

  IF v_bookmaker_id IS NOT NULL AND (v_delta_real != 0 OR v_delta_freebet != 0 OR v_delta_bonus != 0) THEN
    SELECT saldo_atual, saldo_freebet, COALESCE(saldo_bonus, 0) INTO v_saldo_anterior_real, v_saldo_anterior_freebet, v_saldo_anterior_bonus FROM bookmakers WHERE id = v_bookmaker_id FOR UPDATE;
    UPDATE bookmakers SET saldo_atual = COALESCE(saldo_atual, 0) + v_delta_real, saldo_freebet = COALESCE(saldo_freebet, 0) + v_delta_freebet, saldo_bonus = COALESCE(saldo_bonus, 0) + v_delta_bonus, updated_at = NOW() WHERE id = v_bookmaker_id;
    INSERT INTO bookmaker_balance_audit (bookmaker_id, workspace_id, saldo_anterior, saldo_novo, origem, referencia_tipo, referencia_id, user_id, observacoes) VALUES (v_bookmaker_id, NEW.workspace_id, v_saldo_anterior_real, v_saldo_anterior_real + v_delta_real, 'TRIGGER_V5_LEGACY', NEW.tipo_transacao, NEW.id, NEW.user_id, FORMAT('delta_real=%s', v_delta_real));
  END IF;
  
  NEW.balance_processed_at := NOW();
  RETURN NEW;
END;
$$;

-- 3. Create the new trigger V6
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v6 ON cash_ledger;
CREATE TRIGGER tr_cash_ledger_update_bookmaker_balance_v6
  BEFORE INSERT ON public.cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.atualizar_saldo_bookmaker_v6();
