
-- ============================================================
-- PROTEÇÃO: Impedir reversão de baseline broker
-- ============================================================

CREATE OR REPLACE FUNCTION fn_protect_broker_baseline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_broker boolean;
BEGIN
  -- Only check REVERSAL events that target bookmakers in broker projects
  IF NEW.tipo_evento = 'REVERSAL' THEN
    SELECT p.is_broker INTO v_is_broker
    FROM bookmakers b
    JOIN projetos p ON p.id = b.projeto_id
    WHERE b.id = NEW.bookmaker_id;
    
    -- If it's a broker project, check if we're reversing a baseline deposit
    IF v_is_broker = true THEN
      -- Check if the event being reversed is a DEPOSITO baseline
      IF EXISTS (
        SELECT 1 FROM financial_events fe
        WHERE fe.id = NEW.reversed_event_id
          AND fe.tipo_evento = 'DEPOSITO'
          AND fe.event_scope = 'VIRTUAL'
          AND fe.descricao ILIKE '%baseline broker%'
      ) THEN
        RAISE EXCEPTION 'BLOQUEADO: Não é permitido reverter o baseline de capital de uma conta broker (bookmaker_id: %, evento original: %)', 
          NEW.bookmaker_id, NEW.reversed_event_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS tr_protect_broker_baseline ON financial_events;
CREATE TRIGGER tr_protect_broker_baseline
  BEFORE INSERT ON financial_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_protect_broker_baseline();
