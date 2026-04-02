
CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
  v_last_sv_date timestamptz;
  v_adopted_count integer := 0;
  v_cleared_count integer := 0;
  v_virtual_amount numeric := 0;
  v_resolved_project uuid;
BEGIN
  v_resolved_project := NEW.projeto_id;

  INSERT INTO public.financial_debug_log (
    op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
  ) VALUES (
    TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
    'LINK_START',
    jsonb_build_object('workspace_id', NEW.workspace_id, 'saldo_atual', NEW.saldo_atual, 'moeda', NEW.moeda, 'status', NEW.status)
  );

  IF OLD.projeto_id IS NOT NULL THEN
    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'SKIP_ALREADY_LINKED', jsonb_build_object('reason', 'OLD.projeto_id was not null'));
    RETURN NEW;
  END IF;

  IF NEW.projeto_id IS NULL THEN
    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'SKIP_NULL_PROJECT', jsonb_build_object('reason', 'NEW.projeto_id is null'));
    RETURN NEW;
  END IF;

  -- Find last SAQUE_VIRTUAL date (marks end of previous cycle)
  SELECT MAX(created_at) INTO v_last_sv_date
  FROM public.cash_ledger
  WHERE tipo_transacao = 'SAQUE_VIRTUAL'
    AND origem_bookmaker_id = NEW.id
    AND status = 'CONFIRMADO';

  -- STEP 1 (FIRST): Clear previous cycle deposits with this project's snapshot
  -- Must run BEFORE adoption to avoid clearing freshly adopted orphans
  IF v_last_sv_date IS NOT NULL THEN
    UPDATE public.cash_ledger
    SET projeto_id_snapshot = NULL
    WHERE projeto_id_snapshot = v_resolved_project
      AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
      AND created_at <= v_last_sv_date
      AND tipo_transacao NOT IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL');

    GET DIAGNOSTICS v_cleared_count = ROW_COUNT;

    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'PREVIOUS_CYCLE_CLEAR',
      jsonb_build_object('last_sv_date', v_last_sv_date, 'cleared_count', v_cleared_count));
  END IF;

  -- STEP 2 (SECOND): Adopt orphan deposits/withdrawals (NULL snapshot, created AFTER last SV)
  UPDATE public.cash_ledger
  SET projeto_id_snapshot = v_resolved_project
  WHERE projeto_id_snapshot IS NULL
    AND status = 'CONFIRMADO'
    AND tipo_transacao IN ('DEPOSITO', 'SAQUE')
    AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
    AND (v_last_sv_date IS NULL OR created_at >= v_last_sv_date);

  GET DIAGNOSTICS v_adopted_count = ROW_COUNT;

  INSERT INTO public.financial_debug_log (
    op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
  ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
    'ORPHAN_ADOPTION',
    jsonb_build_object('last_sv_date', v_last_sv_date, 'adopted_count', v_adopted_count, 'adopted_types', jsonb_build_array('DEPOSITO', 'SAQUE')));

  -- Skip DV if zero balance
  IF NEW.saldo_atual <= 0 THEN
    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'SKIP_ZERO_BALANCE', jsonb_build_object('saldo_atual', NEW.saldo_atual));
    RETURN NEW;
  END IF;

  -- Idempotency check
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = v_resolved_project
    AND created_at > NOW() - INTERVAL '30 seconds';

  IF v_existing_dv_count > 0 THEN
    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'SKIP_IDEMPOTENT_DV', jsonb_build_object('existing_dv_count', v_existing_dv_count));
    RETURN NEW;
  END IF;

  -- Create DEPOSITO_VIRTUAL baseline
  v_virtual_amount := NEW.saldo_atual;

  INSERT INTO public.cash_ledger (
    workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
    valor, destino_bookmaker_id, destino_tipo,
    status, data_transacao, projeto_id_snapshot,
    descricao, impacta_caixa_operacional
  ) VALUES (
    NEW.workspace_id, NEW.user_id, 'DEPOSITO_VIRTUAL', 'FIAT', NEW.moeda,
    v_virtual_amount, NEW.id, 'BOOKMAKER',
    'CONFIRMADO', CURRENT_DATE, v_resolved_project,
    'Baseline automático ao vincular ao projeto (saldo_atual=' || v_virtual_amount || ')',
    false
  );

  INSERT INTO public.financial_debug_log (
    op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
  ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
    'DV_CREATED',
    jsonb_build_object('virtual_amount', v_virtual_amount, 'last_sv_date', v_last_sv_date, 'adopted_count', v_adopted_count, 'cleared_count', v_cleared_count));

  RETURN NEW;
END;
$$;
