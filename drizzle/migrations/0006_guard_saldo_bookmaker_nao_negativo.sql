-- Trava fail-closed: impede que um evento financeiro deixe o saldo da casa negativo.
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
  v_scope := COALESCE(NEW.event_scope, 'REAL');

  -- Eventos virtuais não movimentam saldo real
  IF v_scope = 'VIRTUAL' THEN RETURN NEW; END IF;

  -- Escape hatch explícito (ajustes, perdas em trânsito, remediações)
  IF COALESCE(NEW.allow_negative, false) THEN RETURN NEW; END IF;

  -- Reversões e estornos precisam poder desfazer estados já inconsistentes
  IF NEW.tipo_evento IN ('REVERSAL', 'ESTORNO', 'AJUSTE') THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Mudança de identidade é tratada pelo trigger de sincronismo; aqui só o delta puro
    IF (OLD.bookmaker_id IS DISTINCT FROM NEW.bookmaker_id)
       OR (COALESCE(OLD.tipo_uso,'NORMAL') IS DISTINCT FROM COALESCE(NEW.tipo_uso,'NORMAL'))
       OR (COALESCE(OLD.event_scope,'REAL') IS DISTINCT FROM v_scope) THEN
      RETURN NEW;
    END IF;
    v_delta := NEW.valor - OLD.valor;
  ELSE
    v_delta := NEW.valor;
  END IF;

  -- Só débitos interessam
  IF v_delta >= 0 THEN RETURN NEW; END IF;

  v_tipo_uso := COALESCE(NEW.tipo_uso, 'NORMAL');

  -- FOR UPDATE serializa saques concorrentes na mesma casa
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

  -- Casa já negativa: não agrava, mas também não bloqueia regularizações menores
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

DROP TRIGGER IF EXISTS trg_guard_saldo_bookmaker_nao_negativo ON public.financial_events;
CREATE TRIGGER trg_guard_saldo_bookmaker_nao_negativo
  BEFORE INSERT OR UPDATE ON public.financial_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_saldo_bookmaker_nao_negativo();