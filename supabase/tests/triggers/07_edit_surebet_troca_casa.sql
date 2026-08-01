-- Regressão: edição de aposta trocando a casa (aba Bônus / formulário Surebet)
-- Garante que a casa antiga é restituída e a casa nova é debitada.
-- Também cobre a troca REAL -> FREEBET no mesmo evento.
BEGIN;

DO $$
DECLARE
  v_ws UUID; v_bk_a UUID; v_bk_b UUID; v_aposta UUID; v_entrada UUID;
  v_a0 NUMERIC; v_b0 NUMERIC; v_a1 NUMERIC; v_b1 NUMERIC; v_bfb NUMERIC;
BEGIN
  SELECT id INTO v_ws FROM public.workspaces LIMIT 1;
  SELECT id INTO v_bk_a FROM public.bookmakers WHERE workspace_id = v_ws LIMIT 1;
  SELECT id INTO v_bk_b FROM public.bookmakers WHERE workspace_id = v_ws AND id <> v_bk_a LIMIT 1;
  IF v_bk_b IS NULL THEN RAISE NOTICE 'skip: workspace sem 2 casas'; RETURN; END IF;

  v_aposta := gen_random_uuid();
  v_entrada := gen_random_uuid();

  SELECT saldo_atual INTO v_a0 FROM public.bookmakers WHERE id = v_bk_a;
  SELECT saldo_atual INTO v_b0 FROM public.bookmakers WHERE id = v_bk_b;

  -- STAKE original na casa A
  INSERT INTO public.financial_events (bookmaker_id, workspace_id, aposta_id, tipo_evento, tipo_uso, valor, moeda, idempotency_key, descricao)
  VALUES (v_bk_a, v_ws, NULL, 'STAKE', 'NORMAL', -100, 'BRL', 'test_stake_entry_' || v_entrada, 'teste troca de casa');

  -- Simula a edição: troca para a casa B (mesmo valor)
  UPDATE public.financial_events SET bookmaker_id = v_bk_b
  WHERE idempotency_key = 'test_stake_entry_' || v_entrada;

  SELECT saldo_atual INTO v_a1 FROM public.bookmakers WHERE id = v_bk_a;
  SELECT saldo_atual INTO v_b1 FROM public.bookmakers WHERE id = v_bk_b;

  ASSERT ABS(v_a1 - v_a0) < 0.01, 'FALHA: casa antiga nao foi restituida (' || v_a0 || ' -> ' || v_a1 || ')';
  ASSERT ABS(v_b1 - (v_b0 - 100)) < 0.01, 'FALHA: casa nova nao foi debitada (' || v_b0 || ' -> ' || v_b1 || ')';

  -- Troca REAL -> FREEBET na mesma casa
  UPDATE public.financial_events SET tipo_uso = 'FREEBET', tipo_evento = 'FREEBET_STAKE'
  WHERE idempotency_key = 'test_stake_entry_' || v_entrada;

  SELECT saldo_atual, saldo_freebet INTO v_b1, v_bfb FROM public.bookmakers WHERE id = v_bk_b;
  ASSERT ABS(v_b1 - v_b0) < 0.01, 'FALHA: saldo real nao foi devolvido ao trocar para FREEBET';

  RAISE NOTICE 'OK: troca de casa e troca de bucket restauram/aplicam saldos corretamente';
END $$;

ROLLBACK;
