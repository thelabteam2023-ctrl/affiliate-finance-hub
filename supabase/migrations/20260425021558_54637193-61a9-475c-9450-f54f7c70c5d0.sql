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
  v_saldo_atual numeric := 0;
  v_saldo_bonus numeric := 0;
  v_saldo_freebet numeric := 0;
  v_saldo_real_migravel numeric := 0;
BEGIN
  SELECT projeto_id, COALESCE(is_broker_account, false),
         COALESCE(saldo_atual, 0), COALESCE(saldo_bonus, 0), COALESCE(saldo_freebet, 0)
    INTO v_current_projeto_id, v_is_broker,
         v_saldo_atual, v_saldo_bonus, v_saldo_freebet
  FROM bookmakers WHERE id = p_bookmaker_id FOR UPDATE;

  IF v_current_projeto_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker já está desvinculada', 'code', 'ALREADY_UNLINKED');
  END IF;

  IF v_current_projeto_id != p_projeto_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker está vinculada a outro projeto', 'code', 'WRONG_PROJECT');
  END IF;

  v_saldo_real_migravel := GREATEST(v_saldo_atual - v_saldo_bonus - v_saldo_freebet, 0);

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
        AND project_id = p_projeto_id
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

  ELSIF v_saldo_real_migravel > 0 THEN
    INSERT INTO cash_ledger (
      tipo_transacao, valor, moeda, workspace_id, user_id,
      origem_bookmaker_id, debito_real,
      descricao, data_transacao,
      impacta_caixa_operacional, tipo_moeda, status, projeto_id_snapshot,
      auditoria_metadata, origem_tipo
    ) VALUES (
      'SAQUE_VIRTUAL', v_saldo_real_migravel, p_moeda, p_workspace_id, p_user_id,
      p_bookmaker_id, v_saldo_real_migravel,
      format('Saque virtual – desvinculação do projeto (real=%s, bonus=%s, freebet=%s)',
             v_saldo_real_migravel, v_saldo_bonus, v_saldo_freebet),
      CURRENT_DATE,
      false, 'FIAT', v_sv_status, p_projeto_id,
      jsonb_build_object(
        'tipo', 'saque_virtual_desvinculacao',
        'projeto_id', p_projeto_id,
        'saldo_total_snapshot', v_saldo_atual,
        'saldo_real_migravel', v_saldo_real_migravel,
        'saldo_bonus_excluido', v_saldo_bonus,
        'saldo_freebet_excluido', v_saldo_freebet,
        'parametro_saldo_virtual_efetivo', p_saldo_virtual_efetivo,
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

  IF p_marcar_para_saque AND v_saldo_real_migravel > 0 AND NOT v_neutralized THEN
    UPDATE bookmakers SET aguardando_saque_at = NOW() WHERE id = p_bookmaker_id;
  ELSE
    UPDATE bookmakers SET aguardando_saque_at = NULL
    WHERE id = p_bookmaker_id AND (v_saldo_real_migravel <= 0 OR v_neutralized);
  END IF;

  UPDATE projeto_bookmaker_historico
  SET data_desvinculacao = NOW(), status_final = p_status_final
  WHERE projeto_id = p_projeto_id AND bookmaker_id = p_bookmaker_id AND data_desvinculacao IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'saque_virtual_id', v_saque_virtual_id,
    'saldo_virtual', v_saldo_real_migravel,
    'saldo_total_original', v_saldo_atual,
    'saldo_bonus_excluido', v_saldo_bonus,
    'saldo_freebet_excluido', v_saldo_freebet,
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