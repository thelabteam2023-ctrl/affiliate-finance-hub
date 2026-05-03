-- Primeiro, vamos garantir que a função de sincronização de saldo do motor financeiro seja robusta
CREATE OR REPLACE FUNCTION public.fn_financial_events_sync_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_delta NUMERIC;
  v_saldo_anterior NUMERIC;
  v_saldo_novo NUMERIC;
BEGIN
  -- Se o evento já foi processado, não faz nada
  IF NEW.processed_at IS NOT NULL AND (TG_OP = 'UPDATE' AND OLD.processed_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  -- HARD RULE: APENAS event_scope = 'REAL' ALTERA SALDO
  IF COALESCE(NEW.event_scope, 'REAL') = 'VIRTUAL' THEN
    RETURN NEW;
  END IF;

  v_delta := NEW.valor;

  -- Ignorar delta zero
  IF v_delta = 0 OR v_delta IS NULL THEN
    RETURN NEW;
  END IF;

  -- Aplicar delta no saldo correto
  IF NEW.tipo_uso = 'FREEBET' THEN
    UPDATE public.bookmakers
    SET saldo_freebet = COALESCE(saldo_freebet, 0) + v_delta,
        updated_at = now()
    WHERE id = NEW.bookmaker_id
    RETURNING saldo_freebet INTO v_saldo_novo;
  ELSE
    UPDATE public.bookmakers
    SET saldo_atual = COALESCE(saldo_atual, 0) + v_delta,
        updated_at = now()
    WHERE id = NEW.bookmaker_id
    RETURNING saldo_atual INTO v_saldo_novo;
  END IF;

  -- Marcar como processado
  NEW.processed_at := now();
  
  -- Registrar auditoria
  INSERT INTO public.bookmaker_balance_audit (
    bookmaker_id, workspace_id, origem, referencia_tipo, referencia_id,
    saldo_anterior, saldo_novo, observacoes, user_id
  ) VALUES (
    NEW.bookmaker_id, NEW.workspace_id, NEW.tipo_evento, 'financial_events', NEW.id,
    v_saldo_novo - v_delta, v_saldo_novo,
    format('[AUTO] Evento %s: %s', NEW.tipo_evento, COALESCE(NEW.descricao, 'Processado automaticamente')),
    NEW.created_by
  );

  RETURN NEW;
END;
$function$;

-- Processar eventos pendentes especificamente da Bora Jogar (Tarcisio)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT id, bookmaker_id, valor, tipo_uso 
        FROM public.financial_events 
        WHERE bookmaker_id = 'cc45164e-7fe4-4dba-bddc-a34d2caf1279' 
        AND processed_at IS NULL 
        AND COALESCE(event_scope, 'REAL') = 'REAL'
        ORDER BY created_at ASC
    LOOP
        IF r.tipo_uso = 'FREEBET' THEN
            UPDATE public.bookmakers SET saldo_freebet = COALESCE(saldo_freebet, 0) + r.valor WHERE id = r.bookmaker_id;
        ELSE
            UPDATE public.bookmakers SET saldo_atual = COALESCE(saldo_atual, 0) + r.valor WHERE id = r.bookmaker_id;
        END IF;
        
        UPDATE public.financial_events SET processed_at = now() WHERE id = r.id;
    END LOOP;
END $$;
