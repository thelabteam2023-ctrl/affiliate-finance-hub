-- =============================================================================
-- TEST 06 — Reversão financeira é rollback total
-- =============================================================================
-- Simula um DEPÓSITO banco→bookmaker de R$ 1.000, snapshoteia todos os
-- indicadores relevantes, chama reverter_movimentacao_caixa, e confere que
-- CADA indicador voltou exatamente ao estado pré-transação (tolerância 0.01).
--
-- Cobre o caso Ítalo/Bora Jogar. Deve ser rodado dentro de transação
-- rollback-only (BEGIN … ROLLBACK) em ambiente de sandbox.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_workspace uuid;
  v_projeto   uuid;
  v_bookmaker uuid;
  v_conta_banco uuid;
  v_user uuid;

  v_saldo_bm_antes   numeric;
  v_saldo_bm_pos_dep numeric;
  v_saldo_bm_pos_rev numeric;

  v_investido_antes    numeric;
  v_investido_pos_dep  numeric;
  v_investido_pos_rev  numeric;

  v_transacao uuid;
  v_result jsonb;
BEGIN
  -- Seleciona qualquer workspace com projeto + bookmaker + conta bancária.
  SELECT p.workspace_id, p.id, bm.id, cb.id, wm.user_id
    INTO v_workspace, v_projeto, v_bookmaker, v_conta_banco, v_user
  FROM public.projetos p
  JOIN public.bookmakers bm ON bm.projeto_id = p.id
  JOIN public.contas_bancarias cb ON cb.workspace_id = p.workspace_id
  JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.role IN ('owner','admin')
  LIMIT 1;

  IF v_workspace IS NULL THEN
    RAISE NOTICE 'Sem fixtures suficientes — pulando teste 06';
    RETURN;
  END IF;

  -- Snapshot ANTES
  SELECT COALESCE(saldo_atual, 0) INTO v_saldo_bm_antes FROM public.bookmakers WHERE id = v_bookmaker;
  SELECT COALESCE(SUM(valor), 0) INTO v_investido_antes
    FROM public.cash_ledger
   WHERE projeto_id_snapshot = v_projeto
     AND tipo_transacao IN ('DEPOSITO','DEPOSITO_VIRTUAL')
     AND status = 'CONFIRMADO'
     AND reversed_at IS NULL;

  -- INSERE depósito de R$ 1000 (Banco → Bookmaker)
  INSERT INTO public.cash_ledger (
    workspace_id, user_id, tipo_transacao, valor, moeda, tipo_moeda, status,
    origem_tipo, origem_conta_bancaria_id,
    destino_tipo, destino_bookmaker_id,
    projeto_id_snapshot, data_transacao, financial_events_generated
  ) VALUES (
    v_workspace, v_user, 'DEPOSITO', 1000, 'BRL', 'FIAT', 'CONFIRMADO',
    'CAIXA_OPERACIONAL', v_conta_banco,
    'BOOKMAKER', v_bookmaker,
    v_projeto, now(), false
  ) RETURNING id INTO v_transacao;

  -- Snapshot PÓS depósito
  SELECT COALESCE(saldo_atual, 0) INTO v_saldo_bm_pos_dep FROM public.bookmakers WHERE id = v_bookmaker;
  SELECT COALESCE(SUM(valor), 0) INTO v_investido_pos_dep
    FROM public.cash_ledger
   WHERE projeto_id_snapshot = v_projeto
     AND tipo_transacao IN ('DEPOSITO','DEPOSITO_VIRTUAL')
     AND status = 'CONFIRMADO'
     AND reversed_at IS NULL;

  ASSERT (v_saldo_bm_pos_dep - v_saldo_bm_antes) = 1000,
    format('Depósito não creditou saldo. antes=%s pos=%s', v_saldo_bm_antes, v_saldo_bm_pos_dep);
  ASSERT (v_investido_pos_dep - v_investido_antes) = 1000,
    'Depósito não subiu o total investido do projeto';

  -- REVERTE (simula auth.uid())
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  SELECT public.reverter_movimentacao_caixa(v_transacao, 'Teste rollback total') INTO v_result;
  ASSERT (v_result->>'success')::boolean, format('RPC falhou: %s', v_result);

  -- Snapshot PÓS reversão
  SELECT COALESCE(saldo_atual, 0) INTO v_saldo_bm_pos_rev FROM public.bookmakers WHERE id = v_bookmaker;
  SELECT COALESCE(SUM(valor), 0) INTO v_investido_pos_rev
    FROM public.cash_ledger
   WHERE projeto_id_snapshot = v_projeto
     AND tipo_transacao IN ('DEPOSITO','DEPOSITO_VIRTUAL')
     AND status = 'CONFIRMADO'
     AND reversed_at IS NULL;

  ASSERT abs(v_saldo_bm_pos_rev - v_saldo_bm_antes) < 0.01,
    format('Reversão não restaurou saldo do bookmaker. antes=%s pos_rev=%s',
           v_saldo_bm_antes, v_saldo_bm_pos_rev);
  ASSERT abs(v_investido_pos_rev - v_investido_antes) < 0.01,
    format('Reversão não restaurou capital investido (KPI). antes=%s pos_rev=%s',
           v_investido_antes, v_investido_pos_rev);

  RAISE NOTICE 'TEST 06 OK — reversão restaurou saldo (%.2f) e capital investido (%.2f)',
    v_saldo_bm_antes, v_investido_antes;
END $$;

ROLLBACK;