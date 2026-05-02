CREATE OR REPLACE FUNCTION public.fn_detect_duplicate_withdrawal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id UUID;
  v_hours_diff NUMERIC;
  v_ignore_duplicate BOOLEAN;
BEGIN
  IF NEW.tipo_transacao != 'SAQUE' THEN RETURN NEW; END IF;
  
  -- Verificar se existe flag para ignorar duplicidade
  v_ignore_duplicate := COALESCE((NEW.auditoria_metadata->>'ignore_duplicate')::boolean, false);
  
  IF v_ignore_duplicate THEN
    -- Se estivermos forçando a confirmação de um que estava bloqueado, limpar o status de bloqueio
    IF NEW.status = 'DUPLICADO_BLOQUEADO' THEN
      NEW.status := 'CONFIRMADO';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'CONFIRMADO' AND (OLD IS NULL OR OLD.status != 'CONFIRMADO') THEN
    SELECT id, EXTRACT(EPOCH FROM (NEW.data_transacao::timestamp - data_transacao::timestamp)) / 3600
    INTO v_existing_id, v_hours_diff
    FROM cash_ledger
    WHERE id != NEW.id
      AND tipo_transacao = 'SAQUE'
      AND status IN ('CONFIRMADO', 'LIQUIDADO')
      AND origem_bookmaker_id = NEW.origem_bookmaker_id
      AND ABS(valor - NEW.valor) < 0.01
      AND COALESCE(destino_parceiro_id, '00000000-0000-0000-0000-000000000000') = COALESCE(NEW.destino_parceiro_id, '00000000-0000-0000-0000-000000000000')
      AND COALESCE(destino_conta_bancaria_id, '00000000-0000-0000-0000-000000000000') = COALESCE(NEW.destino_conta_bancaria_id, '00000000-0000-0000-0000-000000000000')
      AND COALESCE(destino_wallet_id, '00000000-0000-0000-0000-000000000000') = COALESCE(NEW.destino_wallet_id, '00000000-0000-0000-0000-000000000000')
      AND ABS(EXTRACT(EPOCH FROM (NEW.data_transacao::timestamp - data_transacao::timestamp))) / 3600 <= 48
    ORDER BY created_at ASC LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
      NEW.status := 'DUPLICADO_BLOQUEADO';
      NEW.financial_events_generated := TRUE;
      NEW.descricao := COALESCE(NEW.descricao, '') || ' [BLOQUEADO] Duplicidade: ' || v_existing_id::TEXT;
      NEW.auditoria_metadata := COALESCE(NEW.auditoria_metadata, '{}'::jsonb) || 
        jsonb_build_object('duplicidade_detectada', true, 'saque_similar_id', v_existing_id, 'bloqueado_em', NOW());
      RAISE WARNING 'Saque duplicado bloqueado. Similar: %', v_existing_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;