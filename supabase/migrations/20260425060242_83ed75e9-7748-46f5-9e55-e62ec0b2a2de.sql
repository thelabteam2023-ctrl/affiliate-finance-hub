CREATE OR REPLACE FUNCTION public.fn_guard_surebet_pernas_forma_registro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent RECORD;
BEGIN
  SELECT id, forma_registro, estrategia
  INTO v_parent
  FROM public.apostas_unificada
  WHERE id = NEW.aposta_id;

  IF FOUND
     AND COALESCE(v_parent.forma_registro, 'SIMPLES') = 'ARBITRAGEM'
     AND v_parent.estrategia <> 'SUREBET' THEN
    RAISE EXCEPTION 'Arbitragem com pernas deve usar estrategia=SUREBET e motor atômico. aposta_id=%', NEW.aposta_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;