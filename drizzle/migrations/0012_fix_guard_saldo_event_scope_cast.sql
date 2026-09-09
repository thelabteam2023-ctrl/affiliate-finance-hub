CREATE OR REPLACE FUNCTION public.fn_guard_saldo_bookmaker_nao_negativo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope TEXT;
  v_tipo_uso TEXT;
  v_delta NUMERIC;
  v_saldo NUMERIC;
  v_nome TEXT;
  v_moeda TEXT;
BEGIN
  v_scope := COALESCE(NEW.event_scope::text, 'REAL');

  IF v_scope = 'VIRTUAL' THEN RETURN NEW; END IF;

  IF COALESCE(NEW.allow_negative, false) THEN RETURN NEW; END IF;

  IF NEW.tipo_evento IN ('REVERSAL', 'ESTORNO', 'AJUSTE') THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.bookmaker_id IS DISTINCT FROM NEW.bookmaker_id)
       OR (COALESCE(OLD.tipo_uso,'NORMAL') IS DISTINCT FROM COALESCE(NEW.tipo_uso,'NORMAL'))
       OR (COALESCE(OLD.event_scope::text,'REAL') IS DISTINCT FROM v_scope) THEN
      RETURN NEW;
    END IF;
    v_delta := NEW.valor - OLD.valor;
  ELSE
    v_delta := NEW.valor;
  END IF;

  IF v_delta >= 0 THEN RETURN NEW; END IF;

  v_tipo_uso := COALESCE(NEW.tipo_uso, 'NORMAL');

  IF v_tipo_uso = 'FREEBET' THEN
    SELECT COALESCE(saldo_freebet, 0), nome, COALESCE(moeda, 'BRL')
      INTO v_saldo, v_nome, v_moeda
      FROM public.bookmakers WHERE id = NEW.bookmaker_id FOR UPDATE;
  ELSE
    SELECT COALESCE(saldo_atual, 0), nome, COALESCE(moeda, 'BRL')
      INTO v_saldo, v_nome, v_moeda
      FROM public.bookmakers WHERE id = NEW.bookmaker_id FOR UPDATE;
  END IF;

  IF v_saldo IS NULL THEN RETURN NEW; END IF;

  IF (v_saldo + v_delta) < -0.01 THEN
    RAISE EXCEPTION 'SALDO_INSUFICIENTE: % — % disponível: % %, necessário: % %.',
      COALESCE(v_nome, 'Casa'),
      CASE WHEN v_tipo_uso = 'FREEBET' THEN 'freebet' ELSE 'saldo real' END,
      ROUND(v_saldo, 2), v_moeda,
      ROUND(ABS(v_delta), 2), v_moeda;
  END IF;

  RETURN NEW;
END;
$function$;