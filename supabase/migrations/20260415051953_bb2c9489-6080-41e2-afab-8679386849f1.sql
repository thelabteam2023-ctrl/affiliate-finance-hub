
-- 1. Retroalimentar DEPOSITO_VIRTUAL existentes
UPDATE public.cash_ledger dv
SET origem_tipo = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.cash_ledger sv
    WHERE sv.tipo_transacao = 'SAQUE_VIRTUAL'
      AND sv.origem_bookmaker_id = dv.destino_bookmaker_id
      AND sv.created_at < dv.created_at
  ) THEN 'MIGRACAO'
  ELSE 'BASELINE'
END
WHERE dv.tipo_transacao = 'DEPOSITO_VIRTUAL'
  AND dv.origem_tipo IS NULL;

-- 2. Retroalimentar SAQUE_VIRTUAL existentes
UPDATE public.cash_ledger
SET origem_tipo = 'MIGRACAO'
WHERE tipo_transacao = 'SAQUE_VIRTUAL'
  AND origem_tipo IS NULL;

-- 3. Recriar trigger fn_ensure_deposito_virtual_on_link
DROP FUNCTION IF EXISTS public.fn_ensure_deposito_virtual_on_link() CASCADE;

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
  v_adopted_net numeric := 0;
  v_origem_tipo text;
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

  SELECT MAX(created_at) INTO v_last_sv_date
  FROM public.cash_ledger
  WHERE tipo_transacao = 'SAQUE_VIRTUAL'
    AND origem_bookmaker_id = NEW.id
    AND status = 'CONFIRMADO';

  -- Determinar origem_tipo: se houve SV anterior, é migração; senão, baseline
  IF v_last_sv_date IS NOT NULL THEN
    v_origem_tipo := 'MIGRACAO';
  ELSE
    v_origem_tipo := 'BASELINE';
  END IF;

  -- STEP 1: Clear previous cycle deposits (re-link A→B→A)
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

  -- STEP 2: Adopt orphan deposits/withdrawals after last SV
  UPDATE public.cash_ledger
  SET projeto_id_snapshot = v_resolved_project
  WHERE projeto_id_snapshot IS NULL
    AND status = 'CONFIRMADO'
    AND tipo_transacao IN ('DEPOSITO', 'SAQUE')
    AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
    AND (v_last_sv_date IS NULL OR created_at > v_last_sv_date);

  GET DIAGNOSTICS v_adopted_count = ROW_COUNT;

  INSERT INTO public.financial_debug_log (
    op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
  ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
    'ORPHAN_ADOPTION',
    jsonb_build_object('last_sv_date', v_last_sv_date, 'adopted_count', v_adopted_count, 'adopted_types', jsonb_build_array('DEPOSITO', 'SAQUE')));

  -- STEP 2.5: Calculate adopted net value
  IF v_adopted_count > 0 THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN tipo_transacao = 'DEPOSITO' THEN valor
        WHEN tipo_transacao = 'SAQUE' THEN -COALESCE(valor_confirmado, valor)
        ELSE 0
      END
    ), 0) INTO v_adopted_net
    FROM public.cash_ledger
    WHERE projeto_id_snapshot = v_resolved_project
      AND status = 'CONFIRMADO'
      AND tipo_transacao IN ('DEPOSITO', 'SAQUE')
      AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
      AND (v_last_sv_date IS NULL OR created_at > v_last_sv_date);

    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'ADOPTED_NET_CALCULATED',
      jsonb_build_object('adopted_net', v_adopted_net, 'saldo_atual', NEW.saldo_atual));
  END IF;

  IF NEW.saldo_atual <= 0 THEN
    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'SKIP_ZERO_BALANCE', jsonb_build_object('saldo_atual', NEW.saldo_atual));
    RETURN NEW;
  END IF;

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

  v_virtual_amount := GREATEST(NEW.saldo_atual - v_adopted_net, 0);

  IF v_virtual_amount > 0.01 THEN
    INSERT INTO public.cash_ledger (
      workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
      valor, destino_bookmaker_id, destino_tipo,
      status, data_transacao, projeto_id_snapshot,
      descricao, impacta_caixa_operacional, origem_tipo
    ) VALUES (
      NEW.workspace_id, NEW.user_id, 'DEPOSITO_VIRTUAL', 'FIAT', NEW.moeda,
      v_virtual_amount, NEW.id, 'BOOKMAKER',
      'CONFIRMADO', CURRENT_DATE, v_resolved_project,
      'Baseline automático ao vincular ao projeto (saldo_atual=' || NEW.saldo_atual || ', adotado=' || v_adopted_net || ')',
      false, v_origem_tipo
    );

    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'DV_CREATED',
      jsonb_build_object('virtual_amount', v_virtual_amount, 'adopted_net', v_adopted_net, 'saldo_atual', NEW.saldo_atual, 'last_sv_date', v_last_sv_date, 'adopted_count', v_adopted_count, 'cleared_count', v_cleared_count, 'origem_tipo', v_origem_tipo));
  ELSE
    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'DV_SKIPPED_FULLY_ADOPTED',
      jsonb_build_object('saldo_atual', NEW.saldo_atual, 'adopted_net', v_adopted_net, 'adopted_count', v_adopted_count));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_ensure_deposito_virtual_on_link
BEFORE UPDATE ON public.bookmakers
FOR EACH ROW
WHEN (OLD.projeto_id IS DISTINCT FROM NEW.projeto_id AND NEW.projeto_id IS NOT NULL)
EXECUTE FUNCTION public.fn_ensure_deposito_virtual_on_link();

-- 4. Recriar RPC desvincular_bookmaker_atomico com origem_tipo = 'MIGRACAO'
DROP FUNCTION IF EXISTS public.desvincular_bookmaker_atomico(uuid, uuid, uuid, uuid, text, numeric, text, boolean, boolean);

CREATE OR REPLACE FUNCTION public.desvincular_bookmaker_atomico(
  p_bookmaker_id uuid,
  p_projeto_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_status_final text,
  p_saldo_virtual_efetivo numeric,
  p_moeda text,
  p_marcar_para_saque boolean DEFAULT false,
  p_is_investor_account boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saque_virtual_id UUID;
  v_current_projeto_id UUID;
  v_recent_sv_count INTEGER;
  v_sv_status TEXT;
BEGIN
  SELECT projeto_id INTO v_current_projeto_id
  FROM bookmakers WHERE id = p_bookmaker_id FOR UPDATE;

  IF v_current_projeto_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker já está desvinculada', 'code', 'ALREADY_UNLINKED');
  END IF;

  IF v_current_projeto_id != p_projeto_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker está vinculada a outro projeto', 'code', 'WRONG_PROJECT');
  END IF;

  SELECT COUNT(*) INTO v_recent_sv_count
  FROM cash_ledger WHERE origem_bookmaker_id = p_bookmaker_id AND tipo_transacao = 'SAQUE_VIRTUAL' AND created_at >= (NOW() - INTERVAL '10 seconds');

  IF v_recent_sv_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'SAQUE_VIRTUAL duplicado detectado. Aguarde.', 'code', 'DUPLICATE_DETECTED');
  END IF;

  UPDATE cash_ledger SET projeto_id_snapshot = p_projeto_id
  WHERE (origem_bookmaker_id = p_bookmaker_id OR destino_bookmaker_id = p_bookmaker_id)
    AND status = 'PENDENTE' AND projeto_id_snapshot IS NULL;

  UPDATE cash_ledger SET projeto_id_snapshot = p_projeto_id
  WHERE (origem_bookmaker_id = p_bookmaker_id OR destino_bookmaker_id = p_bookmaker_id)
    AND status = 'LIQUIDADO' AND projeto_id_snapshot IS NULL;

  v_sv_status := CASE WHEN p_is_investor_account THEN 'PENDENTE' ELSE 'CONFIRMADO' END;

  IF p_saldo_virtual_efetivo > 0 THEN
    INSERT INTO cash_ledger (
      tipo_transacao, valor, moeda, workspace_id, user_id,
      origem_bookmaker_id, debito_real,
      descricao, data_transacao,
      impacta_caixa_operacional, tipo_moeda, status, projeto_id_snapshot,
      auditoria_metadata, origem_tipo
    ) VALUES (
      'SAQUE_VIRTUAL', p_saldo_virtual_efetivo, p_moeda, p_workspace_id, p_user_id,
      p_bookmaker_id, p_saldo_virtual_efetivo,
      'Saque virtual – desvinculação do projeto', CURRENT_DATE,
      false, 'FIAT', v_sv_status, p_projeto_id,
      jsonb_build_object(
        'tipo', 'saque_virtual_desvinculacao',
        'projeto_id', p_projeto_id,
        'saldo_snapshot', p_saldo_virtual_efetivo,
        'is_investor_account', p_is_investor_account
      ),
      'MIGRACAO'
    )
    RETURNING id INTO v_saque_virtual_id;
  END IF;

  UPDATE bookmakers
  SET projeto_id = NULL, status = p_status_final,
      estado_conta = CASE WHEN p_status_final IN ('limitada', 'bloqueada', 'encerrada') THEN p_status_final ELSE COALESCE(estado_conta, 'ativo') END
  WHERE id = p_bookmaker_id;

  IF p_marcar_para_saque AND p_saldo_virtual_efetivo > 0 THEN
    UPDATE bookmakers SET aguardando_saque_at = NOW() WHERE id = p_bookmaker_id;
  ELSE
    UPDATE bookmakers SET aguardando_saque_at = NULL WHERE id = p_bookmaker_id AND p_saldo_virtual_efetivo <= 0;
  END IF;

  UPDATE projeto_bookmaker_historico
  SET data_desvinculacao = NOW(), status_final = p_status_final
  WHERE projeto_id = p_projeto_id AND bookmaker_id = p_bookmaker_id AND data_desvinculacao IS NULL;

  RETURN jsonb_build_object(
    'success', true, 'saque_virtual_id', v_saque_virtual_id,
    'saldo_virtual', p_saldo_virtual_efetivo, 'status_final', p_status_final, 'sv_status', v_sv_status
  );
END;
$$;
