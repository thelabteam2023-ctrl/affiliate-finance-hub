-- Reconciliação de stake para apostas simples PENDENTES.
-- Corrige o caso em que a casa (bookmaker) de uma aposta é trocada na edição
-- e o débito permanece na casa antiga (saldo nunca devolvido) e não é aplicado na nova.

CREATE OR REPLACE FUNCTION public.fn_reconciliar_stake_aposta_simples(p_aposta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_a RECORD;
  v_free NUMERIC;
  v_real NUMERIC;
  v_expected NUMERIC;
  v_delta NUMERIC;
  v_moeda TEXT;
  v_count INT := 0;
  r RECORD;
BEGIN
  SELECT * INTO v_a FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND OR v_a.bookmaker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_INVALIDA');
  END IF;

  IF EXISTS (SELECT 1 FROM public.apostas_pernas WHERE aposta_id = p_aposta_id) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'MULTI_ENTRY');
  END IF;

  IF COALESCE(v_a.status, '') <> 'PENDENTE' THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'NAO_PENDENTE');
  END IF;

  -- Split real x freebet do stake esperado
  IF COALESCE(v_a.fonte_saldo, '') = 'FREEBET' OR COALESCE(v_a.usar_freebet, false) THEN
    v_free := COALESCE(NULLIF(v_a.stake_freebet, 0), COALESCE(v_a.stake, 0));
  ELSE
    v_free := COALESCE(v_a.stake_freebet, 0);
  END IF;
  v_real := GREATEST(COALESCE(v_a.stake, 0) - v_free, 0);

  SELECT COALESCE(v_a.moeda_operacao, b.moeda, 'BRL') INTO v_moeda
  FROM public.bookmakers b WHERE b.id = v_a.bookmaker_id;

  FOR r IN
    SELECT bk, tu, SUM(valor) AS net
    FROM (
      SELECT fe.bookmaker_id AS bk, COALESCE(fe.tipo_uso, 'NORMAL') AS tu, fe.valor
      FROM public.financial_events fe
      WHERE fe.aposta_id = p_aposta_id
        AND fe.tipo_evento IN ('STAKE', 'FREEBET_STAKE', 'REVERSAL', 'AJUSTE')
      UNION ALL SELECT v_a.bookmaker_id, 'NORMAL', 0
      UNION ALL SELECT v_a.bookmaker_id, 'FREEBET', 0
    ) q
    WHERE bk IS NOT NULL
    GROUP BY bk, tu
  LOOP
    IF r.bk = v_a.bookmaker_id THEN
      v_expected := CASE WHEN r.tu = 'FREEBET' THEN -v_free ELSE -v_real END;
    ELSE
      v_expected := 0;
    END IF;

    v_delta := v_expected - COALESCE(r.net, 0);

    IF ABS(v_delta) > 0.005 THEN
      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        r.bk, p_aposta_id, v_a.workspace_id,
        CASE WHEN v_delta < 0 THEN (CASE WHEN r.tu = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END) ELSE 'REVERSAL' END,
        r.tu,
        CASE WHEN v_delta < 0 THEN 'STAKE' ELSE 'REVERSAL' END,
        v_delta,
        COALESCE((SELECT b2.moeda FROM public.bookmakers b2 WHERE b2.id = r.bk), v_moeda),
        'reconc_stake_' || p_aposta_id::TEXT || '_' || r.bk::TEXT || '_' || r.tu || '_' || EXTRACT(EPOCH FROM clock_timestamp())::TEXT,
        'Reconciliação de stake por edição da aposta (troca de casa/valor)',
        NOW(), v_a.user_id
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'events_created', v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trg_reconciliar_stake_aposta_simples()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_reconciliar_stake_aposta_simples(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reconciliar_stake_aposta_simples ON public.apostas_unificada;

CREATE TRIGGER trg_reconciliar_stake_aposta_simples
AFTER UPDATE OF bookmaker_id, stake, stake_real, stake_freebet, fonte_saldo, usar_freebet
ON public.apostas_unificada
FOR EACH ROW
WHEN (
  NEW.status = 'PENDENTE'
  AND NEW.bookmaker_id IS NOT NULL
  AND (
    OLD.bookmaker_id IS DISTINCT FROM NEW.bookmaker_id
    OR OLD.stake IS DISTINCT FROM NEW.stake
    OR OLD.stake_real IS DISTINCT FROM NEW.stake_real
    OR OLD.stake_freebet IS DISTINCT FROM NEW.stake_freebet
    OR OLD.fonte_saldo IS DISTINCT FROM NEW.fonte_saldo
    OR OLD.usar_freebet IS DISTINCT FROM NEW.usar_freebet
  )
)
EXECUTE FUNCTION public.fn_trg_reconciliar_stake_aposta_simples();

GRANT EXECUTE ON FUNCTION public.fn_reconciliar_stake_aposta_simples(uuid) TO authenticated, service_role;
