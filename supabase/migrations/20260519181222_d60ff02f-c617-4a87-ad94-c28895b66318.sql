-- Desativar o motor incremental V6 para evitar dupla contagem com o motor de eventos
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_v6()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delta_real NUMERIC := 0;
  v_delta_freebet NUMERIC := 0;
  v_delta_bonus NUMERIC := 0;
  v_saldo_anterior_real NUMERIC;
  v_bookmaker_id UUID;
  v_is_new_scoped BOOLEAN;
BEGIN
  -- 1. Idempotency & Status Check
  IF NEW.balance_processed_at IS NOT NULL OR NEW.status != 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;

  -- 2. Scope Check (Only new world accounts)
  SELECT (created_at >= '2026-05-14 00:00:00+00') INTO v_is_new_scoped
  FROM bookmakers WHERE id = COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);

  IF NOT COALESCE(v_is_new_scoped, TRUE) THEN
    RETURN NEW;
  END IF;

  -- 3. Identificar Bookmaker e Deltas APENAS para Auditoria
  -- Removido o UPDATE direto para evitar duplicação com fn_financial_events_sync_balance
  CASE NEW.tipo_transacao
    WHEN 'APOSTA_STAKE' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.debito_real, NEW.valor);
      v_delta_bonus := -COALESCE(NEW.debito_bonus, 0);
      v_delta_freebet := -COALESCE(NEW.debito_freebet, 0);
    WHEN 'APOSTA_GREEN', 'APOSTA_MEIO_GREEN', 'APOSTA_VOID' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
    WHEN 'APOSTA_MEIO_RED' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
    WHEN 'AJUSTE_POSITIVO', 'AJUSTE_SALDO', 'AJUSTE_MANUAL', 'CONCILIACAO', 'GANHO_CAMBIAL', 'CASHBACK_MANUAL', 'CREDITO_CASHBACK', 'GIRO_GRATIS', 'PERDA_REVERSAO', 'DEPOSITO', 'BONUS_CREDITADO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
    WHEN 'AJUSTE_NEGATIVO', 'PERDA_OPERACIONAL', 'PERDA_CAMBIAL', 'CASHBACK_ESTORNO', 'GIRO_GRATIS_ESTORNO', 'SAQUE', 'BONUS_ESTORNO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
    ELSE
      NEW.balance_processed_at := NOW();
      RETURN NEW;
  END CASE;

  -- 4. Registrar em bookmaker_balance_audit para histórico, mas NÃO dar UPDATE no bookmaker
  IF v_bookmaker_id IS NOT NULL THEN
    SELECT saldo_atual INTO v_saldo_anterior_real FROM bookmakers WHERE id = v_bookmaker_id;
    
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
      origem, referencia_tipo, referencia_id, user_id, observacoes
    ) VALUES (
      v_bookmaker_id, NEW.workspace_id,
      v_saldo_anterior_real, v_saldo_anterior_real, -- Saldo não muda via V6
      'TRIGGER_V6_AUDIT_ONLY', NEW.tipo_transacao, NEW.id, NEW.user_id,
      FORMAT('V6_AUDIT: Delta Real %s (Ignored for direct update, processed by event-sync)', v_delta_real)
    );
  END IF;

  NEW.balance_processed_at := NOW();
  RETURN NEW;
END;
$function$;
