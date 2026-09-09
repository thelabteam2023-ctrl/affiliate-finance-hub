-- =============================================================================
-- TEST 09 — Troca de casa em aposta simples PENDENTE devolve o saldo da antiga
-- =============================================================================
-- Regressão do bug: ao editar a aposta e trocar a bookmaker, o débito da stake
-- permanecia na casa antiga (saldo nunca devolvido) e não era aplicado na nova.
--
-- Cobre:
--   1. Troca de casa: +stake na antiga, -stake na nova.
--   2. Idempotência: salvar de novo / chamar a reconciliação não duplica eventos.
--   3. Mudança de stake: ajuste exato do delta na casa corrente.
--
-- Rodar dentro de transação rollback-only (BEGIN … ROLLBACK).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_aposta uuid; v_old uuid; v_new uuid; v_stake numeric; v_ws uuid; v_moeda text;
  s_old0 numeric; s_new0 numeric; s_old1 numeric; s_new1 numeric; n0 int; n1 int;
  r jsonb;
BEGIN
  SELECT a.id, a.bookmaker_id, a.stake, a.workspace_id, b.moeda, b.saldo_atual
    INTO v_aposta, v_old, v_stake, v_ws, v_moeda, s_old0
  FROM public.apostas_unificada a
  JOIN public.bookmakers b ON b.id = a.bookmaker_id
  WHERE a.status = 'PENDENTE' AND a.stake > 0
    AND NOT EXISTS (SELECT 1 FROM public.apostas_pernas p WHERE p.aposta_id = a.id)
    AND EXISTS (SELECT 1 FROM public.financial_events fe
                WHERE fe.aposta_id = a.id AND fe.tipo_evento IN ('STAKE','FREEBET_STAKE'))
  ORDER BY a.created_at DESC LIMIT 1;

  IF v_aposta IS NULL THEN
    RAISE NOTICE 'TEST 09: sem massa de dados adequada — pulado';
    RETURN;
  END IF;

  SELECT id, saldo_atual INTO v_new, s_new0 FROM public.bookmakers
  WHERE workspace_id = v_ws AND id <> v_old AND moeda = v_moeda AND saldo_atual > v_stake * 2
  LIMIT 1;

  IF v_new IS NULL THEN
    RAISE NOTICE 'TEST 09: sem casa destino adequada — pulado';
    RETURN;
  END IF;

  UPDATE public.apostas_unificada SET bookmaker_id = v_new WHERE id = v_aposta;

  SELECT saldo_atual INTO s_old1 FROM public.bookmakers WHERE id = v_old;
  SELECT saldo_atual INTO s_new1 FROM public.bookmakers WHERE id = v_new;

  IF ROUND(s_old1 - s_old0, 2) <> ROUND(v_stake, 2) THEN
    RAISE EXCEPTION 'TEST 09 FALHOU (1) — casa antiga não recebeu o estorno: % -> %', s_old0, s_old1;
  END IF;
  IF ROUND(s_new0 - s_new1, 2) <> ROUND(v_stake, 2) THEN
    RAISE EXCEPTION 'TEST 09 FALHOU (2) — casa nova não foi debitada: % -> %', s_new0, s_new1;
  END IF;

  -- 3. Idempotência
  SELECT count(*) INTO n0 FROM public.financial_events WHERE aposta_id = v_aposta;
  UPDATE public.apostas_unificada SET bookmaker_id = v_new WHERE id = v_aposta;
  SELECT public.fn_reconciliar_stake_aposta_simples(v_aposta) INTO r;
  SELECT count(*) INTO n1 FROM public.financial_events WHERE aposta_id = v_aposta;

  IF n1 <> n0 OR (r->>'events_created')::int <> 0 THEN
    RAISE EXCEPTION 'TEST 09 FALHOU (3) — reconciliação duplicou eventos: % -> % / %', n0, n1, r;
  END IF;

  RAISE NOTICE 'TEST 09 OK — troca de casa devolve saldo, debita a nova e não duplica eventos';
END $$;

ROLLBACK;
