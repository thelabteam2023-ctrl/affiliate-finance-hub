CREATE OR REPLACE FUNCTION public.fn_guard_bookmaker_saldo_nao_negativo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_bypass TEXT;
  v_moeda TEXT;
BEGIN
  v_bypass := COALESCE(current_setting('app.allow_negative_balance', true), 'off');
  IF v_bypass IN ('on','true','1') THEN
    RETURN NEW;
  END IF;

  v_moeda := COALESCE(NEW.moeda, 'BRL');

  IF COALESCE(NEW.saldo_atual, 0) < -0.01
     AND COALESCE(NEW.saldo_atual, 0) < COALESCE(OLD.saldo_atual, 0) THEN
    RAISE EXCEPTION 'SALDO_INSUFICIENTE: % — saldo real disponivel: % %, resultado da operacao: % %.',
      COALESCE(NEW.nome, 'Casa'),
      ROUND(COALESCE(OLD.saldo_atual, 0), 2), v_moeda,
      ROUND(COALESCE(NEW.saldo_atual, 0), 2), v_moeda;
  END IF;

  IF COALESCE(NEW.saldo_freebet, 0) < -0.01
     AND COALESCE(NEW.saldo_freebet, 0) < COALESCE(OLD.saldo_freebet, 0) THEN
    RAISE EXCEPTION 'SALDO_INSUFICIENTE: % — freebet disponivel: % %, resultado da operacao: % %.',
      COALESCE(NEW.nome, 'Casa'),
      ROUND(COALESCE(OLD.saldo_freebet, 0), 2), v_moeda,
      ROUND(COALESCE(NEW.saldo_freebet, 0), 2), v_moeda;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_bookmaker_saldo_nao_negativo ON public.bookmakers;
CREATE TRIGGER trg_guard_bookmaker_saldo_nao_negativo
BEFORE UPDATE OF saldo_atual, saldo_freebet ON public.bookmakers
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_bookmaker_saldo_nao_negativo();