-- 01_lay_results_pl.sql
-- Valida fn_recalc_aposta_consolidado em perna LAY para todos os resultados.
--
-- Esperado (stake=100, odd=2.10):
--   GREEN      → +100
--   RED        → -110  (= stake*(odd-1))
--   MEIO_GREEN → +50
--   MEIO_RED   → -55
--   VOID       → 0

BEGIN;

DO $$
DECLARE
  v_ws UUID := gen_random_uuid();
  v_proj UUID := gen_random_uuid();
  v_bk UUID := gen_random_uuid();
  v_user UUID := gen_random_uuid();
  v_aposta UUID;
  v_stake NUMERIC := 100;
  v_odd NUMERIC := 2.10;
  v_actual NUMERIC;
  r RECORD;
BEGIN
  INSERT INTO workspaces (id, name, created_by) VALUES (v_ws, 'TEST_WS', v_user);
  INSERT INTO projetos (id, workspace_id, nome, moeda_consolidacao, status, created_by)
    VALUES (v_proj, v_ws, 'TEST_PROJ', 'BRL', 'EM_ANDAMENTO', v_user);
  INSERT INTO bookmakers (id, workspace_id, nome, moeda, saldo_atual, status, created_by)
    VALUES (v_bk, v_ws, 'TEST_BK', 'BRL', 1000, 'ativo', v_user);

  FOR r IN
    SELECT * FROM (VALUES
      ('GREEN',      100::numeric),
      ('RED',       -110::numeric),
      ('MEIO_GREEN', 50::numeric),
      ('MEIO_RED',  -55::numeric),
      ('VOID',        0::numeric)
    ) AS t(resultado, expected)
  LOOP
    INSERT INTO apostas_unificada (
      id, workspace_id, projeto_id, bookmaker_id, esporte, evento,
      mercado, forma_registro, status, resultado, stake, odd,
      moeda_operacao, created_by
    ) VALUES (
      gen_random_uuid(), v_ws, v_proj, v_bk, 'futebol', 'TEST x TEST',
      'h2h', 'ARBITRAGEM', 'LIQUIDADA', r.resultado, v_stake, v_odd,
      'BRL', v_user
    ) RETURNING id INTO v_aposta;

    INSERT INTO apostas_pernas (id, aposta_id, tipo, stake, odd, resultado, moeda)
      VALUES (gen_random_uuid(), v_aposta, 'lay', v_stake, v_odd, r.resultado, 'BRL');

    UPDATE apostas_unificada SET updated_at = now() WHERE id = v_aposta;
    SELECT pl_consolidado INTO v_actual FROM apostas_unificada WHERE id = v_aposta;

    IF ROUND(v_actual, 2) <> ROUND(r.expected, 2) THEN
      RAISE EXCEPTION 'LAY % falhou: esperado %, obtido %', r.resultado, r.expected, v_actual;
    END IF;
    RAISE NOTICE '✓ LAY % → %', r.resultado, v_actual;
  END LOOP;

  RAISE NOTICE '✅ 01_lay_results_pl: OK';
END $$;

ROLLBACK;