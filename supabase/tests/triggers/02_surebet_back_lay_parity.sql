-- 02_surebet_back_lay_parity.sql
-- Surebet BACK+LAY liquidada: pl_consolidado do pai = Σ lucro_prejuizo das pernas.
--   BACK 100 @ 2.00 RED  → -100
--   LAY   95 @ 2.10 GREEN → +95
--   Total esperado: -5

BEGIN;

DO $$
DECLARE
  v_ws UUID := gen_random_uuid();
  v_proj UUID := gen_random_uuid();
  v_bk UUID := gen_random_uuid();
  v_user UUID := gen_random_uuid();
  v_aposta UUID := gen_random_uuid();
  v_pl NUMERIC;
  v_soma NUMERIC;
BEGIN
  INSERT INTO workspaces (id, name, created_by) VALUES (v_ws, 'TEST_WS', v_user);
  INSERT INTO projetos (id, workspace_id, nome, moeda_consolidacao, status, created_by)
    VALUES (v_proj, v_ws, 'TEST_PROJ', 'BRL', 'EM_ANDAMENTO', v_user);
  INSERT INTO bookmakers (id, workspace_id, nome, moeda, saldo_atual, status, created_by)
    VALUES (v_bk, v_ws, 'TEST_BK', 'BRL', 1000, 'ativo', v_user);

  INSERT INTO apostas_unificada (
    id, workspace_id, projeto_id, bookmaker_id, esporte, evento, mercado,
    forma_registro, status, stake, odd, moeda_operacao, created_by
  ) VALUES (
    v_aposta, v_ws, v_proj, v_bk, 'futebol', 'TEST x TEST', 'h2h',
    'ARBITRAGEM', 'LIQUIDADA', 195, 2.00, 'BRL', v_user
  );

  INSERT INTO apostas_pernas (id, aposta_id, tipo, stake, odd, resultado, moeda) VALUES
    (gen_random_uuid(), v_aposta, 'back', 100, 2.00, 'RED',   'BRL'),
    (gen_random_uuid(), v_aposta, 'lay',   95, 2.10, 'GREEN', 'BRL');

  UPDATE apostas_unificada SET updated_at = now() WHERE id = v_aposta;

  SELECT pl_consolidado INTO v_pl FROM apostas_unificada WHERE id = v_aposta;
  SELECT SUM(lucro_prejuizo) INTO v_soma FROM apostas_pernas WHERE aposta_id = v_aposta;

  IF ROUND(v_pl, 2) <> ROUND(v_soma, 2) THEN
    RAISE EXCEPTION 'Paridade falhou: pai=% vs Σpernas=%', v_pl, v_soma;
  END IF;

  RAISE NOTICE '✓ BACK+LAY paridade OK: pai=%, Σpernas=%', v_pl, v_soma;
  RAISE NOTICE '✅ 02_surebet_back_lay_parity: OK';
END $$;

ROLLBACK;