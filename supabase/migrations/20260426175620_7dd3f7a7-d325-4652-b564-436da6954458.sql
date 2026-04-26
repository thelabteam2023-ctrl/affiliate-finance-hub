CREATE OR REPLACE FUNCTION public.fn_guard_surebet_pernas_forma_registro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent RECORD;
BEGIN
  SELECT id, forma_registro
  INTO v_parent
  FROM public.apostas_unificada
  WHERE id = NEW.aposta_id;

  IF FOUND
     AND COALESCE(v_parent.forma_registro, 'SIMPLES') <> 'ARBITRAGEM' THEN
    RAISE EXCEPTION 'Pernas de arbitragem só podem ser vinculadas a aposta com forma_registro=ARBITRAGEM. aposta_id=%', NEW.aposta_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;