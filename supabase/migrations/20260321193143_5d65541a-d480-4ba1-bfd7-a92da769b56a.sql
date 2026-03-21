
-- ============================================================
-- FIX: Cancel 6 redundant DEPOSITO_VIRTUAL entries
-- These DVs were created by the trigger even though real deposits
-- already covered the bookmaker balance
-- ============================================================

-- 1. Cancel the redundant DVs in cash_ledger
UPDATE public.cash_ledger
SET status = 'CANCELADO',
    descricao = CONCAT(COALESCE(descricao, ''), ' [CANCELADO: redundante com depósito real existente - auditoria 2026-03-21]')
WHERE id IN (
  'ea53a930-111d-4d25-bc76-7fdd1c9af313', -- BR4BET Erickson R$2575
  '9b03506b-01b2-4284-846c-872976e1f01f', -- APOSTAGANHA Mariana R$2000
  '8e179824-d868-4937-b710-defa0cc70dc7', -- MERIDIANBET Alef R$1877.44
  'c79d44a9-129d-4706-bd18-cf9f3b450c5f', -- BETÃO Mariana R$500
  '6e4c547e-d2fe-45ac-acc8-afc37eeaf803', -- BETANO User002 R$500
  'c288e7a5-1451-495e-9d3c-856c42d3a94f'  -- SUPERBET Mariana R$200
)
AND status = 'CONFIRMADO';

-- 2. Delete the corresponding financial_events to fix balances
DELETE FROM public.financial_events
WHERE descricao ILIKE '%DEPOSITO_VIRTUAL%'
AND bookmaker_id IN (
  '6b7d6316-d6b8-4123-869c-faae6ed7e224', -- BR4BET Erickson
  '588265ab-84cb-4d8a-8384-76153addb2d9', -- APOSTAGANHA Mariana
  '184f5aea-0f4a-4069-9a62-04a9fb762d42', -- MERIDIANBET Alef
  'f4559022-bbd3-47ce-b8d1-58cc7901569d', -- BETÃO Mariana
  '971749a8-5cc9-4d44-8889-3c5b97016e46', -- BETANO User002
  '2af8aa5c-ae63-4245-95d6-44521be86c80'  -- SUPERBET Mariana
);

-- 3. Reset balance_processed_at on cancelled DVs so they don't re-trigger
UPDATE public.cash_ledger
SET financial_events_generated = false,
    balance_processed_at = NULL
WHERE id IN (
  'ea53a930-111d-4d25-bc76-7fdd1c9af313',
  '9b03506b-01b2-4284-846c-872976e1f01f',
  '8e179824-d868-4937-b710-defa0cc70dc7',
  'c79d44a9-129d-4706-bd18-cf9f3b450c5f',
  '6e4c547e-d2fe-45ac-acc8-afc37eeaf803',
  'c288e7a5-1451-495e-9d3c-856c42d3a94f'
);

-- 4. Recalculate balances for affected bookmakers by summing all active financial_events
DO $$
DECLARE
  bm RECORD;
  v_new_balance numeric;
  v_new_freebet numeric;
BEGIN
  FOR bm IN 
    SELECT unnest(ARRAY[
      '6b7d6316-d6b8-4123-869c-faae6ed7e224',
      '588265ab-84cb-4d8a-8384-76153addb2d9',
      '184f5aea-0f4a-4069-9a62-04a9fb762d42',
      'f4559022-bbd3-47ce-b8d1-58cc7901569d',
      '971749a8-5cc9-4d44-8889-3c5b97016e46',
      '2af8aa5c-ae63-4245-95d6-44521be86c80'
    ]::uuid[]) AS id
  LOOP
    SELECT 
      COALESCE(SUM(CASE WHEN tipo_uso = 'NORMAL' THEN valor ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo_uso = 'FREEBET' THEN valor ELSE 0 END), 0)
    INTO v_new_balance, v_new_freebet
    FROM public.financial_events
    WHERE bookmaker_id = bm.id;

    UPDATE public.bookmakers
    SET saldo_atual = v_new_balance,
        saldo_freebet = v_new_freebet,
        updated_at = now()
    WHERE id = bm.id;

    RAISE LOG '[FIX] Bookmaker % recalculado: saldo=%, freebet=%', bm.id, v_new_balance, v_new_freebet;
  END LOOP;
END $$;

-- 5. FIX THE TRIGGER: Improve fn_ensure_deposito_virtual_on_link
-- The key fix: check for ANY existing confirmed DEPOSITO for this bookmaker
-- in the current project AFTER adoption, not just net flow
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

  IF NEW.saldo_atual <= 0 THEN
    RETURN NEW;
  END IF;

  -- STEP 2: Check for ANY existing DV for this bookmaker+project (not just 30s window)
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
  -- This includes deposits that were just adopted in STEP 1
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

-- 6. Also fix the INSERT trigger with the same logic
CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
  v_total_confirmed_deposits numeric := 0;
  v_virtual_amount numeric := 0;
BEGIN
  IF NEW.projeto_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.saldo_atual <= 0 THEN
    RETURN NEW;
  END IF;

  -- Check for existing DV (no time window - absolute check)
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO';

  IF v_existing_dv_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Check total real deposits for this bookmaker
  SELECT COALESCE(SUM(valor), 0) INTO v_total_confirmed_deposits
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO'
    AND status = 'CONFIRMADO'
    AND destino_bookmaker_id = NEW.id;

  v_virtual_amount := NEW.saldo_atual - v_total_confirmed_deposits;

  IF v_virtual_amount <= 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_insert] SKIP: saldo=% covered by deposits=% bookmaker=%',
      NEW.saldo_atual, v_total_confirmed_deposits, NEW.id;
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
    'Saldo existente incorporado ao projeto na vinculação'
  );

  RAISE LOG '[fn_ensure_deposito_virtual_on_insert] DV criado: valor=% bookmaker=% projeto=%',
    v_virtual_amount, NEW.id, NEW.projeto_id;

  RETURN NEW;
END;
$$;
