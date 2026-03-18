
-- ============================================================
-- FIX: Both triggers must check existing real deposits before
-- creating a DEPOSITO_VIRTUAL to prevent double-counting.
-- Formula: DV = saldo_atual - SUM(real deposits already in ledger)
-- If the result is <= 0, no DV is created.
-- ============================================================

-- 1. Fix the INSERT trigger (when bookmaker is created WITH projeto_id)
CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_dv_count integer;
  v_existing_real_deposits numeric;
  v_virtual_amount numeric;
BEGIN
  IF NEW.projeto_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.saldo_atual <= 0 THEN RETURN NEW; END IF;

  -- Idempotência: verificar DV recente (30s)
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO'
    AND created_at >= (now() - interval '30 seconds');

  IF v_existing_dv_count > 0 THEN RETURN NEW; END IF;

  -- SAFETY NET: Verificar depósitos reais já existentes para esta casa+projeto
  SELECT COALESCE(SUM(valor), 0) INTO v_existing_real_deposits
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO'
    AND status = 'CONFIRMADO'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id;

  -- DV = saldo_atual - depósitos reais já registrados
  v_virtual_amount := NEW.saldo_atual - v_existing_real_deposits;

  IF v_virtual_amount <= 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_insert] SKIP: saldo_atual=% já coberto por depósitos reais=% bookmaker=% projeto=%',
      NEW.saldo_atual, v_existing_real_deposits, NEW.id, NEW.projeto_id;
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

  RAISE LOG '[fn_ensure_deposito_virtual_on_insert] DV criado: valor=% (saldo=% - reais=%) bookmaker=% projeto=%',
    v_virtual_amount, NEW.saldo_atual, v_existing_real_deposits, NEW.id, NEW.projeto_id;

  RETURN NEW;
END;
$function$;

-- 2. Fix the LINK trigger (when bookmaker is linked to a project via UPDATE)
CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_dv_count integer;
  v_existing_real_deposits numeric;
  v_virtual_amount numeric;
BEGIN
  IF NEW.projeto_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.saldo_atual <= 0 THEN RETURN NEW; END IF;

  -- Idempotência: verificar DV recente (30s)
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO'
    AND created_at >= (now() - interval '30 seconds');

  IF v_existing_dv_count > 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] SKIP: DV já existe (idempotência) bookmaker=% projeto=%',
      NEW.id, NEW.projeto_id;
    RETURN NEW;
  END IF;

  -- SAFETY NET: Verificar depósitos reais já existentes para esta casa+projeto
  SELECT COALESCE(SUM(valor), 0) INTO v_existing_real_deposits
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO'
    AND status = 'CONFIRMADO'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id;

  -- DV = saldo_atual - depósitos reais já registrados
  v_virtual_amount := NEW.saldo_atual - v_existing_real_deposits;

  IF v_virtual_amount <= 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] SKIP: saldo_atual=% já coberto por depósitos reais=% bookmaker=% projeto=%',
      NEW.saldo_atual, v_existing_real_deposits, NEW.id, NEW.projeto_id;
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

  RAISE LOG '[fn_ensure_deposito_virtual_on_link] DV criado: valor=% (saldo=% - reais=%) moeda=% bookmaker=% projeto=%',
    v_virtual_amount, NEW.saldo_atual, v_existing_real_deposits, NEW.moeda, NEW.id, NEW.projeto_id;

  RETURN NEW;
END;
$function$;
