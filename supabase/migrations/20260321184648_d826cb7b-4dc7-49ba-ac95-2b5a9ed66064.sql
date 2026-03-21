
-- Fix BOTH triggers to prevent DEPOSITO_VIRTUAL when real deposits already cover the balance
-- The issue: triggers only checked deposits with matching projeto_id_snapshot,
-- but real deposits might not have been adopted yet or might have a different snapshot.
-- Fix: Also check ALL real deposits for this bookmaker regardless of projeto_id_snapshot.

CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
  v_last_sv_date timestamptz;
  v_adopted_count integer;
  v_net_real_flow numeric := 0;
  v_total_real_deposits numeric := 0;
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

  -- Adopt orphan ledger entries (projeto_id_snapshot IS NULL)
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

  IF NEW.saldo_atual <= 0 THEN
    RETURN NEW;
  END IF;

  -- Idempotency: check for recent DV (30s window)
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO'
    AND created_at >= (now() - interval '30 seconds');

  IF v_existing_dv_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Calculate net real flow for THIS project
  SELECT COALESCE(SUM(
    CASE
      WHEN destino_bookmaker_id = NEW.id THEN valor
      WHEN origem_bookmaker_id = NEW.id THEN -valor
      ELSE 0
    END
  ), 0)
  INTO v_net_real_flow
  FROM public.cash_ledger
  WHERE projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO'
    AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
    AND tipo_transacao NOT IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL');

  -- CRITICAL FIX: Also check ALL real deposits for this bookmaker regardless of project
  -- This prevents DV when a real deposit exists but wasn't adopted (e.g., had a different projeto_id_snapshot)
  SELECT COALESCE(SUM(valor), 0) INTO v_total_real_deposits
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO'
    AND status = 'CONFIRMADO'
    AND destino_bookmaker_id = NEW.id
    AND (v_last_sv_date IS NULL OR created_at > v_last_sv_date);

  -- Use the GREATER of: project-specific flow OR total real deposits
  -- This ensures we don't create DV when real money already covers the balance
  v_virtual_amount := NEW.saldo_atual - GREATEST(v_net_real_flow, v_total_real_deposits);

  IF v_virtual_amount <= 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] SKIP: saldo_atual=% coberto (fluxo_projeto=%, depositos_totais=%) bookmaker=% projeto=%',
      NEW.saldo_atual, v_net_real_flow, v_total_real_deposits, NEW.id, NEW.projeto_id;
    RETURN NEW;
  END IF;

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
    'Depósito virtual – baseline na vinculação (trigger automático)'
  );

  RAISE LOG '[fn_ensure_deposito_virtual_on_link] DV criado: valor=% (saldo=% - max(fluxo=%,deps=%)) bookmaker=% projeto=%',
    v_virtual_amount, NEW.saldo_atual, v_net_real_flow, v_total_real_deposits, NEW.id, NEW.projeto_id;

  RETURN NEW;
END;
$$;

-- Also fix the INSERT trigger with the same logic
CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
  v_existing_real_deposits numeric;
  v_total_real_deposits numeric;
  v_virtual_amount numeric;
  v_last_sv_date timestamptz;
BEGIN
  IF NEW.projeto_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.saldo_atual <= 0 THEN RETURN NEW; END IF;

  -- Idempotency: check for recent DV (30s)
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO'
    AND created_at >= (now() - interval '30 seconds');

  IF v_existing_dv_count > 0 THEN RETURN NEW; END IF;

  -- Find last SAQUE_VIRTUAL cutoff
  SELECT MAX(created_at) INTO v_last_sv_date
  FROM public.cash_ledger
  WHERE tipo_transacao = 'SAQUE_VIRTUAL'
    AND origem_bookmaker_id = NEW.id
    AND status = 'CONFIRMADO';

  -- Check project-specific real deposits
  SELECT COALESCE(SUM(valor), 0) INTO v_existing_real_deposits
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO'
    AND status = 'CONFIRMADO'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id;

  -- CRITICAL FIX: Also check ALL real deposits regardless of project
  SELECT COALESCE(SUM(valor), 0) INTO v_total_real_deposits
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO'
    AND status = 'CONFIRMADO'
    AND destino_bookmaker_id = NEW.id
    AND (v_last_sv_date IS NULL OR created_at > v_last_sv_date);

  -- DV = saldo - max(project deposits, all deposits)
  v_virtual_amount := NEW.saldo_atual - GREATEST(v_existing_real_deposits, v_total_real_deposits);

  IF v_virtual_amount <= 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_insert] SKIP: saldo_atual=% coberto (projeto=%, total=%) bookmaker=% projeto=%',
      NEW.saldo_atual, v_existing_real_deposits, v_total_real_deposits, NEW.id, NEW.projeto_id;
    RETURN NEW;
  END IF;

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
    'Depósito virtual – baseline na criação com projeto (trigger automático)'
  );

  RAISE LOG '[fn_ensure_deposito_virtual_on_insert] DV criado: valor=% (saldo=% - max(proj=%,total=%)) bookmaker=% projeto=%',
    v_virtual_amount, NEW.saldo_atual, v_existing_real_deposits, v_total_real_deposits, NEW.id, NEW.projeto_id;

  RETURN NEW;
END;
$$;
