-- ============================================================
-- 1) Gatilho de saldo: tratar mudança de identidade no UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_financial_events_sync_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_delta NUMERIC;
  v_bookmaker_id UUID;
  v_tipo_uso TEXT;
  v_event_scope TEXT;
  v_old_scope TEXT;
  v_identity_changed BOOLEAN := false;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_event_scope := COALESCE(OLD.event_scope, 'REAL');
    IF v_event_scope = 'VIRTUAL' OR OLD.valor = 0 THEN RETURN OLD; END IF;
    IF COALESCE(OLD.tipo_uso,'NORMAL') = 'FREEBET' THEN
      UPDATE public.bookmakers SET saldo_freebet = COALESCE(saldo_freebet,0) - OLD.valor, updated_at = now() WHERE id = OLD.bookmaker_id;
    ELSE
      UPDATE public.bookmakers SET saldo_atual = COALESCE(saldo_atual,0) - OLD.valor, updated_at = now() WHERE id = OLD.bookmaker_id;
    END IF;
    RETURN OLD;
  END IF;

  v_event_scope := COALESCE(NEW.event_scope, 'REAL');

  IF (TG_OP = 'UPDATE') THEN
    v_old_scope := COALESCE(OLD.event_scope, 'REAL');
    v_identity_changed := (OLD.bookmaker_id IS DISTINCT FROM NEW.bookmaker_id)
                       OR (COALESCE(OLD.tipo_uso,'NORMAL') IS DISTINCT FROM COALESCE(NEW.tipo_uso,'NORMAL'))
                       OR (v_old_scope IS DISTINCT FROM v_event_scope);

    IF v_identity_changed THEN
      -- Estorna integralmente o estado ANTIGO
      IF v_old_scope <> 'VIRTUAL' AND OLD.valor <> 0 THEN
        IF COALESCE(OLD.tipo_uso,'NORMAL') = 'FREEBET' THEN
          UPDATE public.bookmakers SET saldo_freebet = COALESCE(saldo_freebet,0) - OLD.valor, updated_at = now() WHERE id = OLD.bookmaker_id;
        ELSE
          UPDATE public.bookmakers SET saldo_atual = COALESCE(saldo_atual,0) - OLD.valor, updated_at = now() WHERE id = OLD.bookmaker_id;
        END IF;
      END IF;
      -- Aplica integralmente o estado NOVO
      IF v_event_scope <> 'VIRTUAL' AND NEW.valor <> 0 THEN
        IF COALESCE(NEW.tipo_uso,'NORMAL') = 'FREEBET' THEN
          UPDATE public.bookmakers SET saldo_freebet = COALESCE(saldo_freebet,0) + NEW.valor, updated_at = now() WHERE id = NEW.bookmaker_id;
        ELSE
          UPDATE public.bookmakers SET saldo_atual = COALESCE(saldo_atual,0) + NEW.valor, updated_at = now() WHERE id = NEW.bookmaker_id;
        END IF;
      END IF;
      RETURN NEW;
    END IF;

    v_delta := NEW.valor - OLD.valor;
  ELSE
    v_delta := NEW.valor;
  END IF;

  IF v_delta = 0 OR v_event_scope = 'VIRTUAL' THEN
    RETURN NEW;
  END IF;

  v_bookmaker_id := NEW.bookmaker_id;
  v_tipo_uso := COALESCE(NEW.tipo_uso,'NORMAL');

  IF v_tipo_uso = 'FREEBET' THEN
    UPDATE public.bookmakers SET saldo_freebet = COALESCE(saldo_freebet,0) + v_delta, updated_at = now() WHERE id = v_bookmaker_id;
  ELSE
    UPDATE public.bookmakers SET saldo_atual = COALESCE(saldo_atual,0) + v_delta, updated_at = now() WHERE id = v_bookmaker_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 2) Helper de paridade saldo x eventos
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_bookmaker_parity_sum(p_ids uuid[])
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(
    (COALESCE(b.saldo_atual,0) - COALESCE(ev.ev_real,0))
    + (COALESCE(b.saldo_freebet,0) - COALESCE(ev.ev_fb,0))
  ), 0)
  FROM public.bookmakers b
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE WHEN COALESCE(fe.tipo_uso,'NORMAL') = 'FREEBET' THEN 0 ELSE fe.valor END) AS ev_real,
      SUM(CASE WHEN COALESCE(fe.tipo_uso,'NORMAL') = 'FREEBET' THEN fe.valor ELSE 0 END) AS ev_fb
    FROM public.financial_events fe
    WHERE fe.bookmaker_id = b.id
      AND COALESCE(fe.event_scope,'REAL') = 'REAL'
  ) ev ON true
  WHERE b.id = ANY(p_ids);
$function$;

-- ============================================================
-- 3) fn_sync_stake_event_v1: estorno + novo evento quando a identidade muda
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_sync_stake_event_v1(p_entrada_id uuid, p_aposta_id uuid, p_workspace_id uuid, p_bookmaker_id uuid, p_stake numeric, p_moeda text, p_fonte_saldo text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo_evento TEXT;
  v_tipo_uso TEXT;
  v_idempotency_key TEXT;
  v_tipo TEXT;
  v_odd NUMERIC;
  v_valor_debitar NUMERIC;
  v_descricao TEXT;
  v_existing RECORD;
  v_ts TEXT := extract(epoch from clock_timestamp())::bigint::text;
BEGIN
  SELECT COALESCE(tipo,'back'), COALESCE(odd, 1)
    INTO v_tipo, v_odd
  FROM public.apostas_perna_entradas
  WHERE id = p_entrada_id;

  IF v_tipo = 'lay' AND v_odd > 1 THEN
    v_valor_debitar := p_stake * (v_odd - 1);
    v_descricao := 'Liability lay (Surebet)';
  ELSE
    v_valor_debitar := p_stake;
    v_descricao := 'Stake de entrada (Surebet)';
  END IF;

  v_tipo_evento := CASE WHEN p_fonte_saldo = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END;
  v_tipo_uso    := CASE WHEN p_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END;
  v_idempotency_key := 'stake_entry_' || p_entrada_id;

  -- Normaliza chaves legadas
  UPDATE public.financial_events
    SET idempotency_key = v_idempotency_key
  WHERE aposta_id = p_aposta_id
    AND tipo_evento IN ('STAKE','FREEBET_STAKE')
    AND idempotency_key LIKE '%' || p_entrada_id || '%'
    AND idempotency_key != v_idempotency_key
    AND NOT EXISTS (SELECT 1 FROM public.financial_events x WHERE x.idempotency_key = v_idempotency_key);

  SELECT id, bookmaker_id, tipo_uso, moeda, valor, tipo_evento
    INTO v_existing
  FROM public.financial_events
  WHERE idempotency_key = v_idempotency_key;

  IF FOUND AND (
       v_existing.bookmaker_id IS DISTINCT FROM p_bookmaker_id
    OR COALESCE(v_existing.tipo_uso,'NORMAL') IS DISTINCT FROM v_tipo_uso
    OR COALESCE(v_existing.moeda,'') IS DISTINCT FROM COALESCE(p_moeda,'')
  ) THEN
    -- Arquiva a chave do evento antigo (mantém o registro histórico)
    UPDATE public.financial_events
      SET idempotency_key = v_idempotency_key || '_old_' || v_ts
    WHERE id = v_existing.id;

    -- Estorno auditável do evento antigo (restaura a casa/bucket anterior)
    INSERT INTO public.financial_events (
      bookmaker_id, workspace_id, aposta_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id, descricao, created_by
    ) VALUES (
      v_existing.bookmaker_id, p_workspace_id, p_aposta_id, 'REVERSAL', v_existing.tipo_uso,
      -v_existing.valor, v_existing.moeda,
      'rev_stake_entry_' || p_entrada_id || '_' || v_ts,
      v_existing.id, 'Estorno por edição (troca de casa/fonte/moeda)', p_user_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  INSERT INTO public.financial_events (
    bookmaker_id, workspace_id, aposta_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, created_by
  ) VALUES (
    p_bookmaker_id, p_workspace_id, p_aposta_id, v_tipo_evento, v_tipo_uso,
    -v_valor_debitar, p_moeda, v_idempotency_key, v_descricao, p_user_id
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    valor = EXCLUDED.valor,
    bookmaker_id = EXCLUDED.bookmaker_id,
    moeda = EXCLUDED.moeda,
    tipo_evento = EXCLUDED.tipo_evento,
    tipo_uso = EXCLUDED.tipo_uso,
    descricao = EXCLUDED.descricao;
END;
$function$;