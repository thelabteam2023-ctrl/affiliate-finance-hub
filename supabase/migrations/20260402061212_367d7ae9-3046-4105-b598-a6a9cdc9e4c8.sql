
-- FIX: Prevent double-counting when re-linking a bookmaker to the same project
-- When DEPOSITO_VIRTUAL is created, old transactions from previous cycles
-- (before the last SAQUE_VIRTUAL cutoff) should be cleared from this project's scope

CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_dv_count integer;
  v_last_sv_date timestamptz;
  v_adopted_count integer;
  v_cleared_count integer;
  v_total_confirmed_deposits numeric := 0;
  v_virtual_amount numeric := 0;
BEGIN
  -- Only fire when projeto_id is being SET (NULL -> value)
  IF OLD.projeto_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.projeto_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find last SAQUE_VIRTUAL cutoff date
  SELECT MAX(created_at) INTO v_last_sv_date
  FROM public.cash_ledger
  WHERE tipo_transacao = 'SAQUE_VIRTUAL'
    AND origem_bookmaker_id = NEW.id
    AND status = 'CONFIRMADO';

  -- STEP 1: Adopt orphan ledger entries (projeto_id_snapshot IS NULL)
  UPDATE public.cash_ledger
  SET projeto_id_snapshot = NEW.projeto_id
  WHERE projeto_id_snapshot IS NULL
    AND status = 'CONFIRMADO'
    AND tipo_transacao IN (
      'DEPOSITO', 'SAQUE', 'AJUSTE_MANUAL',
      'GANHO_CAMBIAL', 'PERDA_CAMBIAL',
      'BONUS_CREDITADO', 'CASHBACK_MANUAL', 'GIRO_GRATIS'
    )
    AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
    AND (v_last_sv_date IS NULL OR created_at > v_last_sv_date);

  GET DIAGNOSTICS v_adopted_count = ROW_COUNT;

  IF v_adopted_count > 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] Adotados % lançamentos órfãos para projeto % (bookmaker %, corte: %)',
      v_adopted_count, NEW.projeto_id, NEW.id, COALESCE(v_last_sv_date::text, 'VIRGEM');
  END IF;

  -- STEP 1b: CLEAR old entries from PREVIOUS CYCLES that still point to this project
  -- When a bookmaker was in this project before, moved away, and now returns,
  -- the old transactions belong to the previous cycle and must NOT count in the new one.
  -- The DEPOSITO_VIRTUAL will baseline the full current balance.
  IF v_last_sv_date IS NOT NULL THEN
    UPDATE public.cash_ledger
    SET projeto_id_snapshot = NULL
    WHERE projeto_id_snapshot = NEW.projeto_id
      AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
      AND created_at < v_last_sv_date
      AND tipo_transacao NOT IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL');

    GET DIAGNOSTICS v_cleared_count = ROW_COUNT;

    IF v_cleared_count > 0 THEN
      RAISE LOG '[fn_ensure_deposito_virtual_on_link] Limpados % lançamentos de ciclo anterior para bookmaker=% projeto=% (corte: %)',
        v_cleared_count, NEW.id, NEW.projeto_id, v_last_sv_date::text;
    END IF;
  END IF;

  IF NEW.saldo_atual <= 0 THEN
    RETURN NEW;
  END IF;

  -- STEP 2: Check for ANY existing DV for this bookmaker+project
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO';

  IF v_existing_dv_count > 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] SKIP: DV já existe para bookmaker=% projeto=%',
      NEW.id, NEW.projeto_id;
    RETURN NEW;
  END IF;

  -- STEP 3: Calculate total confirmed deposits for this bookmaker (after cutoff)
  SELECT COALESCE(SUM(valor), 0) INTO v_total_confirmed_deposits
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO'
    AND status = 'CONFIRMADO'
    AND destino_bookmaker_id = NEW.id
    AND (v_last_sv_date IS NULL OR created_at > v_last_sv_date);

  -- STEP 4: Only create DV for the GAP between saldo and real deposits
  v_virtual_amount := NEW.saldo_atual - v_total_confirmed_deposits;

  IF v_virtual_amount <= 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] SKIP: saldo_atual=% fully covered by deposits=% bookmaker=% projeto=%',
      NEW.saldo_atual, v_total_confirmed_deposits, NEW.id, NEW.projeto_id;
    RETURN NEW;
  END IF;

  -- STEP 5: Create DV only for the uncovered gap
  INSERT INTO public.cash_ledger (
    tipo_transacao, status, valor, moeda, tipo_moeda,
    destino_bookmaker_id, projeto_id_snapshot,
    user_id, workspace_id,
    data_transacao, impacta_caixa_operacional,
    descricao
  ) VALUES (
    'DEPOSITO_VIRTUAL', 'CONFIRMADO', v_virtual_amount, NEW.moeda,
    CASE WHEN NEW.moeda IN ('BTC','ETH','USDT','USDC','SOL','BNB','ADA','XRP','DOGE','MATIC') THEN 'CRYPTO' ELSE 'FIAT' END,
    NEW.id, NEW.projeto_id,
    NEW.user_id, NEW.workspace_id,
    CURRENT_DATE, false,
    'Saldo existente incorporado ao projeto na vinculação'
  );

  RAISE LOG '[fn_ensure_deposito_virtual_on_link] DV criado: valor=% (saldo=% - deposits=%) bookmaker=% projeto=%',
    v_virtual_amount, NEW.saldo_atual, v_total_confirmed_deposits, NEW.id, NEW.projeto_id;

  RETURN NEW;
END;
$$;

-- DATA FIX: Clear the old R$2000 deposit from Bonus Fenix's scope
-- It belongs to a previous cycle; the DEPOSITO_VIRTUAL of R$4535.18 already baselines everything
UPDATE public.cash_ledger
SET projeto_id_snapshot = NULL
WHERE id = '11a2aeae-410e-4fd4-a08a-f17c039164fb'
  AND tipo_transacao = 'DEPOSITO'
  AND valor = 2000;
