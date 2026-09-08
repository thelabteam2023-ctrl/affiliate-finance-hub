-- (1) process_financial_event: respeita p_allow_negative e devolve erro estruturado
CREATE OR REPLACE FUNCTION public.process_financial_event(
  p_bookmaker_id uuid,
  p_aposta_id uuid DEFAULT NULL::uuid,
  p_tipo_evento text DEFAULT NULL::text,
  p_tipo_uso text DEFAULT 'NORMAL'::text,
  p_origem text DEFAULT NULL::text,
  p_valor numeric DEFAULT 0,
  p_moeda text DEFAULT 'BRL'::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_reversed_event_id uuid DEFAULT NULL::uuid,
  p_descricao text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_allow_negative boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id uuid;
  v_user_id uuid;
  v_event_id uuid;
  v_final_key text;
  v_saldo_atual numeric;
  v_saldo_freebet numeric;
BEGIN
  SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
  FROM bookmakers WHERE id = p_bookmaker_id;

  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker não encontrada');
  END IF;

  v_final_key := COALESCE(p_idempotency_key, gen_random_uuid()::text);

  SELECT id INTO v_event_id FROM financial_events WHERE idempotency_key = v_final_key;
  IF v_event_id IS NOT NULL THEN
    SELECT saldo_atual, saldo_freebet INTO v_saldo_atual, v_saldo_freebet FROM bookmakers WHERE id = p_bookmaker_id;
    RETURN jsonb_build_object('success', true, 'event_id', v_event_id, 'idempotent', true, 'saldo_atual', v_saldo_atual, 'saldo_freebet', v_saldo_freebet);
  END IF;

  BEGIN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, created_by,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, reversed_event_id, descricao, metadata,
      allow_negative
    ) VALUES (
      p_bookmaker_id, p_aposta_id, v_workspace_id, v_user_id,
      p_tipo_evento, p_tipo_uso, p_origem, p_valor, p_moeda,
      v_final_key, p_reversed_event_id, p_descricao, p_metadata,
      COALESCE(p_allow_negative, false)
    )
    RETURNING id INTO v_event_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'SALDO_INSUFICIENTE%' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'SALDO_INSUFICIENTE', 'error', SQLERRM);
    END IF;
    RAISE;
  END;

  SELECT saldo_atual, saldo_freebet INTO v_saldo_atual, v_saldo_freebet FROM bookmakers WHERE id = p_bookmaker_id;

  RETURN jsonb_build_object('success', true, 'event_id', v_event_id, 'saldo_atual', v_saldo_atual, 'saldo_freebet', v_saldo_freebet);
END;
$function$;

-- (2) Detecção de duplicidade: janela ampliada (7 dias de competência OU 24h de registro)
CREATE OR REPLACE FUNCTION public.fn_detect_duplicate_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id UUID;
  v_ignore_duplicate BOOLEAN;
BEGIN
  IF NEW.tipo_transacao != 'SAQUE' THEN RETURN NEW; END IF;

  v_ignore_duplicate := COALESCE((NEW.auditoria_metadata->>'ignore_duplicate')::boolean, false);
  IF v_ignore_duplicate THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('PENDENTE','CONFIRMADO')
     AND (OLD IS NULL OR OLD.status IS DISTINCT FROM NEW.status) THEN

    SELECT id
    INTO v_existing_id
    FROM cash_ledger
    WHERE id != NEW.id
      AND tipo_transacao = 'SAQUE'
      AND status IN ('PENDENTE','CONFIRMADO','LIQUIDADO')
      AND origem_bookmaker_id = NEW.origem_bookmaker_id
      AND ABS(valor - NEW.valor) < 0.01
      AND (
        -- mesma competência dentro de 7 dias
        ABS(EXTRACT(EPOCH FROM (NEW.data_transacao::timestamp - data_transacao::timestamp))) / 86400 <= 7
        -- OU registrados na mesma janela operacional de 24h (pega o retroativo)
        OR ABS(EXTRACT(EPOCH FROM (NEW.created_at - created_at))) / 3600 <= 24
      )
    ORDER BY created_at ASC LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      NEW.auditoria_metadata := COALESCE(NEW.auditoria_metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'duplicidade_detectada', true,
          'saque_similar_id', v_existing_id,
          'saque_similar_detectado_em', NOW()
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;