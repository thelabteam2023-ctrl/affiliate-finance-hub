-- ============================================================================
-- 1. RPC desvincular_bookmaker_atomico — usa parte real para SAQUE_VIRTUAL de migração
-- ============================================================================
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

  -- Parte REAL efetivamente migrável (exclui bônus e freebet, que não saíram do caixa)
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
    -- Grava SAQUE_VIRTUAL apenas com a parte REAL (exclui bônus + freebet)
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

-- ============================================================================
-- 2. Trigger fn_ensure_deposito_virtual_on_link — para MIGRACAO usa só parte real
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_last_sv_id UUID;
  v_last_sv_date TIMESTAMPTZ;
  v_last_sv_projeto UUID;
  v_last_sv_valor NUMERIC;
  v_adopted_count INT := 0;
  v_recent_dv_exists BOOLEAN;
  v_origem_tipo TEXT;
  v_usage_count INT := 0;
  v_window_seconds NUMERIC;
  v_dv_valor NUMERIC;
  v_saldo_real NUMERIC;
BEGIN
  IF NEW.projeto_id IS NULL OR (OLD.projeto_id IS NOT NULL AND OLD.projeto_id = NEW.projeto_id) THEN
    RETURN NEW;
  END IF;

  SELECT id, created_at, projeto_id_snapshot, valor
    INTO v_last_sv_id, v_last_sv_date, v_last_sv_projeto, v_last_sv_valor
  FROM cash_ledger
  WHERE origem_bookmaker_id = NEW.id
    AND tipo_transacao = 'SAQUE_VIRTUAL'
    AND status = 'CONFIRMADO'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Neutralização ping-pong (mesmo projeto, sem uso real)
  IF v_last_sv_id IS NOT NULL
     AND v_last_sv_projeto = NEW.projeto_id
     AND NEW.is_broker_account = false
     AND NEW.investidor_id IS NULL
     AND ABS(COALESCE(v_last_sv_valor, 0) - COALESCE(NEW.saldo_atual, 0)) < 0.02
  THEN
    SELECT
      (SELECT COUNT(*) FROM apostas_unificada
        WHERE bookmaker_id = NEW.id AND projeto_id = NEW.projeto_id AND created_at > v_last_sv_date)
      +
      (SELECT COUNT(*) FROM apostas_pernas ap
        JOIN apostas_unificada au ON au.id = ap.aposta_id
        WHERE ap.bookmaker_id = NEW.id AND au.projeto_id = NEW.projeto_id AND ap.created_at > v_last_sv_date)
      +
      (SELECT COUNT(*) FROM cash_ledger
        WHERE (origem_bookmaker_id = NEW.id OR destino_bookmaker_id = NEW.id)
          AND projeto_id_snapshot = NEW.projeto_id
          AND tipo_transacao IN ('DEPOSITO','SAQUE','CONVERSAO','GANHO_CAMBIAL','PERDA_CAMBIAL','AJUSTE','TRANSFERENCIA')
          AND status IN ('CONFIRMADO','PENDENTE')
          AND created_at > v_last_sv_date
          AND id <> v_last_sv_id)
    INTO v_usage_count;

    IF v_usage_count = 0 THEN
      v_window_seconds := EXTRACT(EPOCH FROM (NOW() - v_last_sv_date));
      UPDATE cash_ledger
         SET status = 'CANCELADO',
             auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
               'cancelled_at', NOW(),
               'cancelled_reason', 'ping_pong_neutralized_by_usage',
               'cancelled_by_rpc', 'fn_ensure_deposito_virtual_on_link',
               'projeto_id', NEW.projeto_id,
               'window_seconds', v_window_seconds,
               'usage_count', 0
             )
       WHERE id = v_last_sv_id;

      BEGIN
        INSERT INTO financial_debug_log (event_type, payload)
        VALUES ('PINGPONG_SV_CANCELLED', jsonb_build_object(
          'sv_id', v_last_sv_id,
          'sv_valor', v_last_sv_valor,
          'sv_created', v_last_sv_date,
          'window_seconds', v_window_seconds,
          'bookmaker_id', NEW.id,
          'projeto_id', NEW.projeto_id,
          'trigger_version', 'usage_based_v1'
        ));
      EXCEPTION WHEN undefined_table THEN
        NULL;
      END;
      RETURN NEW;
    END IF;
  END IF;

  -- Adoção de órfãos
  IF v_last_sv_date IS NOT NULL THEN
    UPDATE cash_ledger
       SET projeto_id_snapshot = NEW.projeto_id
     WHERE (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
       AND projeto_id_snapshot IS NULL
       AND tipo_transacao IN ('DEPOSITO', 'GANHO_CAMBIAL', 'PERDA_CAMBIAL')
       AND created_at > v_last_sv_date;
    GET DIAGNOSTICS v_adopted_count = ROW_COUNT;
  ELSE
    UPDATE cash_ledger
       SET projeto_id_snapshot = NEW.projeto_id
     WHERE (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
       AND projeto_id_snapshot IS NULL
       AND tipo_transacao IN ('DEPOSITO', 'GANHO_CAMBIAL', 'PERDA_CAMBIAL');
    GET DIAGNOSTICS v_adopted_count = ROW_COUNT;
  END IF;

  -- Idempotência
  SELECT EXISTS(
    SELECT 1 FROM cash_ledger
    WHERE destino_bookmaker_id = NEW.id
      AND tipo_transacao = 'DEPOSITO_VIRTUAL'
      AND projeto_id_snapshot = NEW.projeto_id
      AND created_at > NOW() - INTERVAL '30 seconds'
  ) INTO v_recent_dv_exists;

  IF v_recent_dv_exists THEN
    RETURN NEW;
  END IF;

  -- Determina origem
  IF v_last_sv_date IS NOT NULL AND v_last_sv_projeto IS DISTINCT FROM NEW.projeto_id THEN
    v_origem_tipo := 'MIGRACAO';
  ELSE
    v_origem_tipo := 'BASELINE';
  END IF;

  -- Calcula valor a gravar:
  --   MIGRACAO  → apenas a parte REAL (saldo_atual − saldo_bonus − saldo_freebet)
  --   BASELINE  → saldo_atual cheio (informativo, não conta no fluxo)
  v_saldo_real := GREATEST(
    COALESCE(NEW.saldo_atual, 0) - COALESCE(NEW.saldo_bonus, 0) - COALESCE(NEW.saldo_freebet, 0),
    0
  );

  IF v_origem_tipo = 'MIGRACAO' THEN
    v_dv_valor := v_saldo_real;
  ELSE
    v_dv_valor := COALESCE(NEW.saldo_atual, 0);
  END IF;

  IF v_dv_valor > 0 THEN
    INSERT INTO cash_ledger (
      workspace_id, user_id, tipo_transacao, tipo_moeda, moeda, valor,
      destino_bookmaker_id, destino_tipo, projeto_id_snapshot,
      origem_tipo, status, data_transacao, descricao,
      auditoria_metadata
    ) VALUES (
      NEW.workspace_id, NEW.user_id, 'DEPOSITO_VIRTUAL', 'FIAT', NEW.moeda, v_dv_valor,
      NEW.id, 'BOOKMAKER', NEW.projeto_id,
      v_origem_tipo, 'CONFIRMADO', CURRENT_DATE,
      format('Baseline automático ao vincular ao projeto (saldo_atual=%s, parte_real=%s, adotado=%s, tipo=%s)',
             NEW.saldo_atual, v_saldo_real, v_adopted_count, v_origem_tipo),
      jsonb_build_object(
        'saldo_atual_snapshot', NEW.saldo_atual,
        'saldo_bonus_excluido', NEW.saldo_bonus,
        'saldo_freebet_excluido', NEW.saldo_freebet,
        'saldo_real_calculado', v_saldo_real,
        'origem_tipo', v_origem_tipo,
        'trigger_version', 'real_only_migracao_v1'
      )
    );
  END IF;

  RETURN NEW;
END
$function$;

-- ============================================================================
-- 3. Backfill: corrige a Everygame migrada (8de2ba2c-…) de $600 → $400
--    SV original: a090b156-9729-4597-b253-cf8c7a4a77d2 (saiu projeto origem)
--    DV destino : b7e06884-972b-4c5f-8a82-b24dbdc412cc (entrou projeto destino)
--    Bookmaker  : 8de2ba2c-011b-49f4-970e-be8637a9b05e (saldo $600 = $400 real + $200 bônus)
-- ============================================================================
UPDATE cash_ledger
   SET valor = 400,
       descricao = 'Saque virtual – desvinculação do projeto (real=400, bonus=200, freebet=0) [BACKFILL]',
       auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
         'backfilled_at', NOW(),
         'backfill_reason', 'separar_bonus_de_capital_real_migrado',
         'valor_anterior', 600,
         'valor_corrigido', 400,
         'saldo_bonus_excluido', 200,
         'saldo_freebet_excluido', 0,
         'backfill_version', 'real_only_migracao_v1'
       )
 WHERE id = 'a090b156-9729-4597-b253-cf8c7a4a77d2';

UPDATE cash_ledger
   SET valor = 400,
       descricao = 'Baseline automático ao vincular ao projeto (saldo_atual=600, parte_real=400, tipo=MIGRACAO) [BACKFILL]',
       auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
         'backfilled_at', NOW(),
         'backfill_reason', 'separar_bonus_de_capital_real_migrado',
         'valor_anterior', 600,
         'valor_corrigido', 400,
         'saldo_bonus_excluido', 200,
         'saldo_freebet_excluido', 0,
         'backfill_version', 'real_only_migracao_v1'
       )
 WHERE id = 'b7e06884-972b-4c5f-8a82-b24dbdc412cc';