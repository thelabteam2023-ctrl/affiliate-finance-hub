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
  v_migrated_bonus_count INT := 0;
  v_credited_at_destino TIMESTAMPTZ := (CURRENT_DATE::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_real_deposit_total NUMERIC := 0;
  v_dv_bruto NUMERIC := 0;
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

  IF v_last_sv_date IS NOT NULL AND v_last_sv_projeto IS DISTINCT FROM NEW.projeto_id THEN
    v_origem_tipo := 'MIGRACAO';
  ELSE
    v_origem_tipo := 'BASELINE';
  END IF;

  v_saldo_real := GREATEST(
    COALESCE(NEW.saldo_atual, 0) - COALESCE(NEW.saldo_bonus, 0) - COALESCE(NEW.saldo_freebet, 0),
    0
  );

  SELECT COALESCE(SUM(COALESCE(valor_destino, valor)), 0)
    INTO v_real_deposit_total
  FROM cash_ledger
  WHERE destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND tipo_transacao = 'DEPOSITO'
    AND status = 'CONFIRMADO'
    AND (
      v_last_sv_date IS NULL
      OR created_at > v_last_sv_date
    );

  IF v_origem_tipo = 'MIGRACAO' THEN
    v_dv_bruto := v_saldo_real;
  ELSE
    v_dv_bruto := COALESCE(NEW.saldo_atual, 0);
  END IF;

  v_dv_valor := GREATEST(v_dv_bruto - v_real_deposit_total, 0);

  IF v_dv_valor > 0.009 THEN
    INSERT INTO cash_ledger (
      workspace_id, user_id, tipo_transacao, tipo_moeda, moeda, valor,
      destino_bookmaker_id, destino_tipo, projeto_id_snapshot,
      origem_tipo, status, data_transacao, descricao,
      auditoria_metadata
    ) VALUES (
      NEW.workspace_id, NEW.user_id, 'DEPOSITO_VIRTUAL', 'FIAT', NEW.moeda, v_dv_valor,
      NEW.id, 'BOOKMAKER', NEW.projeto_id,
      v_origem_tipo, 'CONFIRMADO', CURRENT_DATE,
      format('Baseline automático ao vincular ao projeto (saldo_atual=%s, parte_real=%s, adotado=%s, depositos_reais=%s, tipo=%s)',
             NEW.saldo_atual, v_saldo_real, v_adopted_count, v_real_deposit_total, v_origem_tipo),
      jsonb_build_object(
        'saldo_atual_snapshot', NEW.saldo_atual,
        'saldo_bonus_excluido', NEW.saldo_bonus,
        'saldo_freebet_excluido', NEW.saldo_freebet,
        'saldo_real_calculado', v_saldo_real,
        'depositos_reais_adotados', v_real_deposit_total,
        'origem_tipo', v_origem_tipo,
        'trigger_version', 'real_only_migracao_v4_subtract_real_deposits'
      )
    );
  END IF;

  IF v_origem_tipo = 'MIGRACAO' AND v_last_sv_projeto IS NOT NULL THEN
    WITH bonus_origem AS (
      SELECT *
      FROM public.project_bookmaker_link_bonuses
      WHERE bookmaker_id = NEW.id
        AND project_id = v_last_sv_projeto
        AND status = 'credited'
    ),
    inserted AS (
      INSERT INTO public.project_bookmaker_link_bonuses (
        workspace_id, project_id, bookmaker_id, title, bonus_amount, currency,
        status, credited_at, expires_at, notes, created_by, user_id, source,
        template_snapshot, rollover_multiplier, rollover_base, rollover_target_amount,
        rollover_progress, deposit_amount, min_odds, deadline_days, saldo_atual,
        cotacao_credito_snapshot, cotacao_credito_at, valor_brl_referencia,
        valor_creditado_no_saldo, migrado_para_saldo_unificado, tipo_bonus,
        valor_consolidado_snapshot, created_at, updated_at
      )
      SELECT
        NEW.workspace_id, NEW.projeto_id, bookmaker_id, title, bonus_amount, currency,
        'credited', v_credited_at_destino, expires_at,
        COALESCE(notes, '')
          || E'\n[Migrado automaticamente do projeto ' || v_last_sv_projeto::text
          || ' em ' || NOW()::text || '; competência atribuída ao projeto destino em '
          || v_credited_at_destino::text || ']',
        created_by, user_id, source,
        template_snapshot, rollover_multiplier, rollover_base, rollover_target_amount,
        rollover_progress, deposit_amount, min_odds, deadline_days, saldo_atual,
        cotacao_credito_snapshot, cotacao_credito_at, valor_brl_referencia,
        valor_creditado_no_saldo, migrado_para_saldo_unificado, tipo_bonus,
        valor_consolidado_snapshot, created_at, NOW()
      FROM bonus_origem
      RETURNING id
    )
    SELECT COUNT(*) INTO v_migrated_bonus_count FROM inserted;

    IF v_migrated_bonus_count > 0 THEN
      UPDATE public.project_bookmaker_link_bonuses
         SET status = 'finalized',
             finalized_at = NOW(),
             finalized_by = NEW.user_id,
             finalize_reason = 'migrated_to_other_project',
             notes = COALESCE(notes, '') || E'\n[Bônus migrado para projeto ' || NEW.projeto_id::text
                     || ' em ' || NOW()::text || ' via trigger fn_ensure_deposito_virtual_on_link]',
             updated_at = NOW()
       WHERE bookmaker_id = NEW.id
         AND project_id = v_last_sv_projeto
         AND status = 'credited';

      BEGIN
        INSERT INTO financial_debug_log (event_type, payload)
        VALUES ('BONUS_MIGRATED_ON_LINK', jsonb_build_object(
          'bookmaker_id', NEW.id,
          'projeto_origem', v_last_sv_projeto,
          'projeto_destino', NEW.projeto_id,
          'bonus_count', v_migrated_bonus_count,
          'credited_at_destino', v_credited_at_destino,
          'trigger_version', 'real_only_migracao_v4_subtract_real_deposits'
        ));
      EXCEPTION WHEN undefined_table THEN
        NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END
$function$;