-- ============================================================
-- PING-PONG NEUTRALIZATION (SV PHANTOM + PAIR CANCELLATION)
-- Estende o mecanismo de neutralização para o cenário simétrico:
-- usuário desvincula → re-vincula em <5min sem operar entre os eventos.
-- Nesse caso, cancela o SV anterior E o novo DV (ambos viram CANCELADO).
-- 
-- Janela: 5 minutos (cobre clique errado / arrependimento imediato).
-- Exclusões: contas de investidor e contas broker (is_broker_account=true).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_dv_count integer;
  v_last_sv_date timestamptz;
  v_adopted_count integer := 0;
  v_cleared_count integer := 0;
  v_virtual_amount numeric := 0;
  v_resolved_project uuid;
  v_adopted_net numeric := 0;
  v_origem_tipo text;
  -- Ping-pong neutralization
  v_recent_sv_id uuid;
  v_recent_sv_valor numeric;
  v_recent_sv_projeto uuid;
  v_recent_sv_created timestamptz;
  v_used_between_count integer := 0;
  v_used_apostas boolean := false;
  v_used_pernas boolean := false;
  v_pingpong_neutralized boolean := false;
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

  -- ============================================================
  -- PING-PONG DETECTION
  -- Se o último SV foi <5min, mesma casa+projeto, sem uso real entre eles
  -- E não é conta investidor/broker → neutraliza o par (cancela SV + impede DV)
  -- ============================================================
  IF v_last_sv_date IS NOT NULL
     AND v_last_sv_date >= (NOW() - INTERVAL '5 minutes')
     AND NOT COALESCE(NEW.is_broker_account, false)
     AND NEW.investidor_id IS NULL
  THEN
    SELECT id, valor, projeto_id_snapshot, created_at
      INTO v_recent_sv_id, v_recent_sv_valor, v_recent_sv_projeto, v_recent_sv_created
    FROM public.cash_ledger
    WHERE tipo_transacao = 'SAQUE_VIRTUAL'
      AND origem_bookmaker_id = NEW.id
      AND status = 'CONFIRMADO'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_recent_sv_projeto = v_resolved_project
       AND ABS(COALESCE(v_recent_sv_valor,0) - COALESCE(NEW.saldo_atual,0)) < 0.02
    THEN
      -- Verifica uso entre o SV anterior e agora (sem janela: tudo após o SV)
      SELECT EXISTS (
        SELECT 1 FROM apostas_unificada
        WHERE bookmaker_id = NEW.id
          AND projeto_id = v_resolved_project
          AND created_at >= v_recent_sv_created
      ) INTO v_used_apostas;

      IF NOT v_used_apostas THEN
        SELECT EXISTS (
          SELECT 1 FROM apostas_pernas ap
          JOIN apostas_unificada au ON au.id = ap.aposta_id
          WHERE ap.bookmaker_id = NEW.id
            AND au.projeto_id = v_resolved_project
            AND ap.created_at >= v_recent_sv_created
        ) INTO v_used_pernas;
      END IF;

      SELECT COUNT(*) INTO v_used_between_count
      FROM public.cash_ledger
      WHERE (origem_bookmaker_id = NEW.id OR destino_bookmaker_id = NEW.id)
        AND tipo_transacao IN ('DEPOSITO','SAQUE','CONVERSAO','GANHO_CAMBIAL','PERDA_CAMBIAL','AJUSTE','TRANSFERENCIA')
        AND status IN ('CONFIRMADO','PENDENTE')
        AND created_at >= v_recent_sv_created;

      IF NOT v_used_apostas AND NOT v_used_pernas AND v_used_between_count = 0 THEN
        -- PING-PONG CONFIRMADO: cancela o SV anterior
        UPDATE public.cash_ledger
        SET status = 'CANCELADO',
            updated_at = NOW(),
            auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
              'cancelled_at', NOW(),
              'cancelled_reason', 'ping_pong_neutralized',
              'cancelled_by_rpc', 'fn_ensure_deposito_virtual_on_link',
              'projeto_id', v_resolved_project,
              'window_seconds', EXTRACT(EPOCH FROM (NOW() - v_recent_sv_created))
            )
        WHERE id = v_recent_sv_id;

        v_pingpong_neutralized := true;

        INSERT INTO public.financial_debug_log (
          op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
        ) VALUES (TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
          'PINGPONG_SV_CANCELLED',
          jsonb_build_object(
            'sv_id', v_recent_sv_id,
            'sv_valor', v_recent_sv_valor,
            'sv_created', v_recent_sv_created,
            'window_seconds', EXTRACT(EPOCH FROM (NOW() - v_recent_sv_created))
          ));

        -- Reativa o DV baseline anterior do mesmo ciclo (se foi cancelado por algum motivo)
        -- Também reanexa qualquer freebet desanexada no SV
        UPDATE public.freebets_recebidas
        SET projeto_id = v_resolved_project, updated_at = NOW()
        WHERE bookmaker_id = NEW.id
          AND projeto_id IS NULL
          AND COALESCE(utilizada, false) = false
          AND status IN ('PENDENTE','LIBERADA','NAO_LIBERADA')
          AND updated_at >= v_recent_sv_created;

        -- Sai cedo: NÃO cria DV novo, o ciclo anterior é restaurado
        RETURN NEW;
      END IF;
    END IF;
  END IF;

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
$function$;

-- ============================================================
-- Estende exclusão de neutralização phantom no UNLINK para incluir broker
-- ============================================================
CREATE OR REPLACE FUNCTION public.desvincular_bookmaker_atomico(
  p_bookmaker_id uuid, p_projeto_id uuid, p_user_id uuid, p_workspace_id uuid,
  p_status_final text, p_saldo_virtual_efetivo numeric, p_moeda text,
  p_marcar_para_saque boolean DEFAULT false, p_is_investor_account boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_saque_virtual_id UUID;
  v_current_projeto_id UUID;
  v_recent_sv_count INTEGER;
  v_sv_status TEXT;
  v_freebets_desanexadas INTEGER := 0;
  v_link_started_at timestamptz;
  v_dv_baseline_id UUID;
  v_dv_baseline_valor numeric;
  v_has_apostas BOOLEAN := false;
  v_has_pernas BOOLEAN := false;
  v_used_ledger INTEGER := 0;
  v_used_bonus INTEGER := 0;
  v_used_freebet INTEGER := 0;
  v_used_ocorrencia INTEGER := 0;
  v_casa_utilizada BOOLEAN := false;
  v_neutralized BOOLEAN := false;
  v_is_broker BOOLEAN := false;
BEGIN
  SELECT projeto_id, COALESCE(is_broker_account, false) INTO v_current_projeto_id, v_is_broker
  FROM bookmakers WHERE id = p_bookmaker_id FOR UPDATE;

  IF v_current_projeto_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker já está desvinculada', 'code', 'ALREADY_UNLINKED');
  END IF;

  IF v_current_projeto_id != p_projeto_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker está vinculada a outro projeto', 'code', 'WRONG_PROJECT');
  END IF;

  SELECT COUNT(*) INTO v_recent_sv_count
  FROM cash_ledger
  WHERE origem_bookmaker_id = p_bookmaker_id
    AND tipo_transacao = 'SAQUE_VIRTUAL'
    AND created_at >= (NOW() - INTERVAL '10 seconds');

  IF v_recent_sv_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'SAQUE_VIRTUAL duplicado detectado. Aguarde.', 'code', 'DUPLICATE_DETECTED');
  END IF;

  SELECT id, valor, created_at
    INTO v_dv_baseline_id, v_dv_baseline_valor, v_link_started_at
  FROM cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = p_bookmaker_id
    AND projeto_id_snapshot = p_projeto_id
    AND status = 'CONFIRMADO'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_dv_baseline_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM apostas_unificada
      WHERE bookmaker_id = p_bookmaker_id AND projeto_id = p_projeto_id
    ) INTO v_has_apostas;

    IF NOT v_has_apostas THEN
      SELECT EXISTS (
        SELECT 1 FROM apostas_pernas ap
        JOIN apostas_unificada au ON au.id = ap.aposta_id
        WHERE ap.bookmaker_id = p_bookmaker_id AND au.projeto_id = p_projeto_id
      ) INTO v_has_pernas;
    END IF;

    SELECT COUNT(*) INTO v_used_ledger
    FROM cash_ledger
    WHERE projeto_id_snapshot = p_projeto_id
      AND (origem_bookmaker_id = p_bookmaker_id OR destino_bookmaker_id = p_bookmaker_id)
      AND tipo_transacao IN ('DEPOSITO','SAQUE','CONVERSAO','GANHO_CAMBIAL','PERDA_CAMBIAL','AJUSTE','TRANSFERENCIA')
      AND status IN ('CONFIRMADO','PENDENTE')
      AND created_at >= v_link_started_at;

    BEGIN
      SELECT COUNT(*) INTO v_used_bonus
      FROM project_bookmaker_link_bonuses
      WHERE bookmaker_id = p_bookmaker_id
        AND projeto_id = p_projeto_id
        AND COALESCE(status,'') NOT IN ('cancelled');
    EXCEPTION WHEN OTHERS THEN
      v_used_bonus := 0;
    END;

    SELECT COUNT(*) INTO v_used_freebet
    FROM freebets_recebidas
    WHERE bookmaker_id = p_bookmaker_id AND projeto_id = p_projeto_id;

    BEGIN
      SELECT COUNT(*) INTO v_used_ocorrencia
      FROM ocorrencias
      WHERE bookmaker_id = p_bookmaker_id AND projeto_id = p_projeto_id;
    EXCEPTION WHEN OTHERS THEN
      v_used_ocorrencia := 0;
    END;

    v_casa_utilizada := v_has_apostas
                     OR v_has_pernas
                     OR v_used_ledger > 0
                     OR v_used_bonus > 0
                     OR v_used_freebet > 0
                     OR v_used_ocorrencia > 0;
  END IF;

  UPDATE cash_ledger SET projeto_id_snapshot = p_projeto_id
  WHERE (origem_bookmaker_id = p_bookmaker_id OR destino_bookmaker_id = p_bookmaker_id)
    AND status = 'PENDENTE' AND projeto_id_snapshot IS NULL;

  UPDATE cash_ledger SET projeto_id_snapshot = p_projeto_id
  WHERE (origem_bookmaker_id = p_bookmaker_id OR destino_bookmaker_id = p_bookmaker_id)
    AND status = 'LIQUIDADO' AND projeto_id_snapshot IS NULL;

  v_sv_status := CASE WHEN p_is_investor_account THEN 'PENDENTE' ELSE 'CONFIRMADO' END;

  -- VÍNCULO FANTASMA: cancela DV em vez de criar SV
  -- Exclui contas de investidor E broker (capital próprio do cliente)
  IF v_dv_baseline_id IS NOT NULL
     AND NOT v_casa_utilizada
     AND ABS(COALESCE(p_saldo_virtual_efetivo,0) - COALESCE(v_dv_baseline_valor,0)) < 0.02
     AND NOT p_is_investor_account
     AND NOT v_is_broker
  THEN
    UPDATE cash_ledger
    SET status = 'CANCELADO',
        updated_at = NOW(),
        auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
          'cancelled_at', NOW(),
          'cancelled_reason', 'phantom_link_unused',
          'cancelled_by_rpc', 'desvincular_bookmaker_atomico',
          'cancelled_user_id', p_user_id,
          'projeto_id', p_projeto_id
        )
    WHERE id = v_dv_baseline_id;

    v_neutralized := true;
    v_saque_virtual_id := NULL;

  ELSIF p_saldo_virtual_efetivo > 0 THEN
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
        'is_investor_account', p_is_investor_account,
        'is_broker_account', v_is_broker
      ),
      'MIGRACAO'
    )
    RETURNING id INTO v_saque_virtual_id;
  END IF;

  UPDATE freebets_recebidas
  SET projeto_id = NULL, updated_at = NOW()
  WHERE bookmaker_id = p_bookmaker_id
    AND projeto_id = p_projeto_id
    AND COALESCE(utilizada, false) = false
    AND status IN ('PENDENTE', 'LIBERADA', 'NAO_LIBERADA');

  GET DIAGNOSTICS v_freebets_desanexadas = ROW_COUNT;

  UPDATE bookmakers
  SET projeto_id = NULL, status = p_status_final,
      estado_conta = CASE WHEN p_status_final IN ('limitada','bloqueada','encerrada') THEN p_status_final ELSE COALESCE(estado_conta,'ativo') END
  WHERE id = p_bookmaker_id;

  IF p_marcar_para_saque AND p_saldo_virtual_efetivo > 0 AND NOT v_neutralized THEN
    UPDATE bookmakers SET aguardando_saque_at = NOW() WHERE id = p_bookmaker_id;
  ELSE
    UPDATE bookmakers SET aguardando_saque_at = NULL
    WHERE id = p_bookmaker_id AND (p_saldo_virtual_efetivo <= 0 OR v_neutralized);
  END IF;

  UPDATE projeto_bookmaker_historico
  SET data_desvinculacao = NOW(), status_final = p_status_final
  WHERE projeto_id = p_projeto_id AND bookmaker_id = p_bookmaker_id AND data_desvinculacao IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'saque_virtual_id', v_saque_virtual_id,
    'saldo_virtual', p_saldo_virtual_efetivo,
    'status_final', p_status_final,
    'sv_status', v_sv_status,
    'freebets_desanexadas', v_freebets_desanexadas,
    'phantom_link_neutralized', v_neutralized,
    'baseline_dv_cancelled_id', CASE WHEN v_neutralized THEN v_dv_baseline_id ELSE NULL END,
    'is_broker_account', v_is_broker,
    'usage_evidence', jsonb_build_object(
      'apostas', v_has_apostas OR v_has_pernas,
      'ledger_real', v_used_ledger,
      'bonus', v_used_bonus,
      'freebet', v_used_freebet,
      'ocorrencia', v_used_ocorrencia
    )
  );
END;
$function$;