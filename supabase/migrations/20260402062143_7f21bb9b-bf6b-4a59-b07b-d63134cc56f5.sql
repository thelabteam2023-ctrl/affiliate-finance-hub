
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
  v_cleared_count integer;
  v_virtual_amount numeric := 0;
BEGIN
  IF OLD.projeto_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.projeto_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT MAX(created_at) INTO v_last_sv_date
  FROM public.cash_ledger
  WHERE tipo_transacao = 'SAQUE_VIRTUAL'
    AND origem_bookmaker_id = NEW.id
    AND status = 'CONFIRMADO';

  -- STEP 1: Adopt ONLY real deposit/saque orphans
  -- FX, adjustments, bonuses etc are NOT adopted - they belong to no project
  UPDATE public.cash_ledger
  SET projeto_id_snapshot = NEW.projeto_id
  WHERE projeto_id_snapshot IS NULL
    AND status = 'CONFIRMADO'
    AND tipo_transacao IN ('DEPOSITO', 'SAQUE')
    AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
    AND (v_last_sv_date IS NULL OR created_at > v_last_sv_date);

  GET DIAGNOSTICS v_adopted_count = ROW_COUNT;
  IF v_adopted_count > 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] Adotados % depósitos/saques órfãos para projeto % (bookmaker %, corte: %)',
      v_adopted_count, NEW.projeto_id, NEW.id, COALESCE(v_last_sv_date::text, 'VIRGEM');
  END IF;

  -- STEP 1b: Clear old entries from previous cycles
  IF v_last_sv_date IS NOT NULL THEN
    UPDATE public.cash_ledger
    SET projeto_id_snapshot = NULL
    WHERE projeto_id_snapshot = NEW.projeto_id
      AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
      AND created_at < v_last_sv_date
      AND tipo_transacao NOT IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL');

    GET DIAGNOSTICS v_cleared_count = ROW_COUNT;
    IF v_cleared_count > 0 THEN
      RAISE LOG '[fn_ensure_deposito_virtual_on_link] Limpados % lançamentos de ciclo anterior para bookmaker=% projeto=%',
        v_cleared_count, NEW.id, NEW.projeto_id;
    END IF;
  END IF;

  IF NEW.saldo_atual <= 0 THEN
    RETURN NEW;
  END IF;

  -- STEP 2: Idempotency check
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND created_at > NOW() - INTERVAL '30 seconds';

  IF v_existing_dv_count > 0 THEN
    RETURN NEW;
  END IF;

  -- STEP 3: Create DEPOSITO_VIRTUAL = saldo_atual (clean baseline)
  v_virtual_amount := NEW.saldo_atual;

  INSERT INTO public.cash_ledger (
    workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
    valor, destino_bookmaker_id, destino_tipo,
    status, data_transacao, projeto_id_snapshot,
    descricao, impacta_caixa_operacional
  ) VALUES (
    NEW.workspace_id, NEW.user_id, 'DEPOSITO_VIRTUAL', 'FIAT', NEW.moeda,
    v_virtual_amount, NEW.id, 'BOOKMAKER',
    'CONFIRMADO', CURRENT_DATE, NEW.projeto_id,
    'Baseline automático ao vincular ao projeto (saldo_atual=' || v_virtual_amount || ')',
    false
  );

  RETURN NEW;
END;
$$;
