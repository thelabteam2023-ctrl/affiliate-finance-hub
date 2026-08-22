CREATE OR REPLACE FUNCTION public.fn_guard_saldo_entrada_surebet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_required NUMERIC;
  v_saldo NUMERIC;
  v_nome TEXT;
  v_moeda TEXT;
  v_is_fb BOOLEAN;
  v_perna_resultado TEXT;
  v_aposta_status TEXT;
BEGIN
  -- Bypass explícito para rotinas administrativas/migrações
  IF COALESCE(current_setting('app.skip_saldo_guard', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Bypass para recálculo/edição orquestrada de surebet: nesse caminho a RPC
  -- faz REVERSAL + reemissão dos eventos financeiros; a stake NÃO é uma nova
  -- reserva, e a guarda de reserva produziria falso "saldo insuficiente".
  IF COALESCE(current_setting('app.surebet_recalc_context', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.bookmaker_id IS NULL OR COALESCE(NEW.stake, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Operação JÁ LIQUIDADA: o saldo atual já absorveu o resultado (stake perdida
  -- em RED, payout creditado em GREEN). Reaplicar a trava de reserva aqui
  -- bloquearia indevidamente a reliquidação.
  SELECT ap.resultado, au.status
    INTO v_perna_resultado, v_aposta_status
  FROM public.apostas_pernas ap
  JOIN public.apostas_unificada au ON au.id = ap.aposta_id
  WHERE ap.id = NEW.perna_id;

  IF COALESCE(v_aposta_status, '') = 'LIQUIDADA'
     OR (v_perna_resultado IS NOT NULL AND v_perna_resultado <> 'PENDENTE') THEN
    RETURN NEW;
  END IF;

  v_is_fb := COALESCE(NEW.fonte_saldo, 'REAL') = 'FREEBET';

  IF COALESCE(NEW.tipo, 'back') = 'lay' AND COALESCE(NEW.odd, 0) > 1 THEN
    v_required := NEW.stake * (NEW.odd - 1);
  ELSE
    v_required := NEW.stake;
  END IF;

  SELECT b.nome, b.moeda,
         CASE WHEN v_is_fb THEN COALESCE(b.saldo_freebet, 0) ELSE COALESCE(b.saldo_atual, 0) END
    INTO v_nome, v_moeda, v_saldo
  FROM public.bookmakers b
  WHERE b.id = NEW.bookmaker_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Casa de apostas não encontrada para validação de saldo (%).', NEW.bookmaker_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.bookmaker_id = NEW.bookmaker_id
     AND (COALESCE(OLD.fonte_saldo,'REAL') = 'FREEBET') = v_is_fb THEN
    IF COALESCE(OLD.tipo, 'back') = 'lay' AND COALESCE(OLD.odd, 0) > 1 THEN
      v_saldo := v_saldo + (COALESCE(OLD.stake,0) * (OLD.odd - 1));
    ELSE
      v_saldo := v_saldo + COALESCE(OLD.stake, 0);
    END IF;
  END IF;

  IF v_required > GREATEST(v_saldo, 0) + 0.01 THEN
    RAISE EXCEPTION 'Saldo insuficiente em % (%): necessário %, disponível %.',
      COALESCE(v_nome, 'casa'), COALESCE(v_moeda, 'BRL'),
      ROUND(v_required, 2), ROUND(GREATEST(v_saldo, 0), 2);
  END IF;

  RETURN NEW;
END;
$function$;