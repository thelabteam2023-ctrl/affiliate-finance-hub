-- 03_edit_liquidada_ledger_parity.sql
-- Invariante de paridade: bookmakers.saldo_atual = Σ cash_ledger.valor.
-- Esta versão é um seed mínimo (depósito + stake + payout) — testes mais
-- amplos via RPCs reais serão adicionados em iterações futuras.

BEGIN;

DO $$
DECLARE
  v_ws UUID := gen_random_uuid();
  v_bk UUID := gen_random_uuid();
  v_user UUID := gen_random_uuid();
  v_saldo NUMERIC;
  v_soma NUMERIC;
BEGIN
  INSERT INTO workspaces (id, name, created_by) VALUES (v_ws, 'TEST_WS', v_user);
  INSERT INTO bookmakers (id, workspace_id, nome, moeda, saldo_atual, status, created_by)
    VALUES (v_bk, v_ws, 'TEST_BK', 'BRL', 0, 'ativo', v_user);

  INSERT INTO cash_ledger (workspace_id, bookmaker_id, tipo_movimento, valor, descricao, created_by) VALUES
    (v_ws, v_bk, 'DEPOSITO', 500, 'fixture', v_user),
    (v_ws, v_bk, 'STAKE',   -100, 'fixture', v_user),
    (v_ws, v_bk, 'PAYOUT',   210, 'fixture', v_user);

  SELECT saldo_atual INTO v_saldo FROM bookmakers WHERE id = v_bk;
  SELECT COALESCE(SUM(valor), 0) INTO v_soma FROM cash_ledger WHERE bookmaker_id = v_bk;

  IF ABS(v_saldo - v_soma) > 0.01 THEN
    RAISE EXCEPTION 'Paridade ledger quebrada: saldo=% vs Σledger=%', v_saldo, v_soma;
  END IF;

  RAISE NOTICE '✓ Paridade ledger OK: saldo=%, Σledger=%', v_saldo, v_soma;
  RAISE NOTICE '✅ 03_edit_liquidada_ledger_parity: OK';
END $$;

ROLLBACK;