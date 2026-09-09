-- =============================================================================
-- TEST 08 — Edição de lançamento financeiro com a trava de saldo ativa
-- =============================================================================
-- Regressão do erro "operator does not exist: event_scope = text", que quebrava
-- a edição de arbitragem (troca de casa, odd, stake) e a reliquidação.
--
-- Verifica:
--   1. UPDATE em financial_events existente NÃO estoura erro de tipo.
--   2. A trava continua recusando débito acima do saldo (SALDO_INSUFICIENTE).
--   3. UPDATE que melhora o saldo (valor menos negativo) passa.
--
-- Rodar dentro de transação rollback-only (BEGIN … ROLLBACK).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_event uuid;
  v_bookmaker uuid;
  v_saldo numeric;
  v_msg text;
BEGIN
  SELECT fe.id, fe.bookmaker_id, b.saldo_atual
    INTO v_event, v_bookmaker, v_saldo
  FROM public.financial_events fe
  JOIN public.bookmakers b ON b.id = fe.bookmaker_id
  WHERE fe.event_scope = 'REAL'
    AND COALESCE(fe.tipo_uso,'NORMAL') = 'NORMAL'
    AND fe.valor < 0
    AND COALESCE(b.saldo_atual,0) > 10
  ORDER BY fe.created_at DESC
  LIMIT 1;

  IF v_event IS NULL THEN
    RAISE NOTICE 'TEST 08: sem massa de dados adequada — pulado';
    RETURN;
  END IF;

  -- 1. Ajuste pequeno para baixo: deve passar sem erro de tipo
  BEGIN
    UPDATE public.financial_events SET valor = valor - 0.01 WHERE id = v_event;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'TEST 08 FALHOU (1) — UPDATE simples recusado: %', SQLERRM;
  END;

  -- 2. Débito muito acima do saldo: deve ser recusado com SALDO_INSUFICIENTE
  BEGIN
    UPDATE public.financial_events SET valor = valor - (v_saldo + 1000000) WHERE id = v_event;
    RAISE EXCEPTION 'TEST 08 FALHOU (2) — débito acima do saldo foi aceito';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    IF v_msg NOT LIKE 'SALDO_INSUFICIENTE%' THEN
      RAISE EXCEPTION 'TEST 08 FALHOU (2) — erro inesperado: %', v_msg;
    END IF;
  END;

  -- 3. Correção para cima (delta positivo): sempre liberada
  BEGIN
    UPDATE public.financial_events SET valor = valor + 0.01 WHERE id = v_event;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'TEST 08 FALHOU (3) — correção para cima recusada: %', SQLERRM;
  END;

  RAISE NOTICE 'TEST 08 OK — edição de lançamento financeira sem erro de tipo e com trava ativa';
END $$;

ROLLBACK;
