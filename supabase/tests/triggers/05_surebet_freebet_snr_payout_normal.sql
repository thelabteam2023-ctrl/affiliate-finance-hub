-- 05_surebet_freebet_snr_payout_normal.sql
-- Garante que FREEBET_PAYOUT nunca seja gravado com tipo_uso <> 'NORMAL'.
-- Cobre o guardrail chk_freebet_payout_tipo_uso_normal e valida a política:
-- lucro de freebet SNR vai SEMPRE para saldo real.

BEGIN;

DO $$
DECLARE
  v_ws   UUID := gen_random_uuid();
  v_bk   UUID := gen_random_uuid();
  v_user UUID := gen_random_uuid();
  v_ap   UUID := gen_random_uuid();
  v_blocked BOOLEAN := false;
BEGIN
  INSERT INTO workspaces (id, name, created_by) VALUES (v_ws, 'TEST_WS_FB', v_user);
  INSERT INTO bookmakers (id, workspace_id, nome, moeda, saldo_atual, status, created_by)
    VALUES (v_bk, v_ws, 'TEST_BK_FB', 'BRL', 0, 'ativo', v_user);

  -- (1) FREEBET_PAYOUT com tipo_uso='NORMAL' deve ser aceito
  INSERT INTO financial_events (
    workspace_id, bookmaker_id, aposta_id, user_id, tipo_evento, tipo_uso, valor,
    moeda, idempotency_key, descricao
  ) VALUES (
    v_ws, v_bk, v_ap, v_user, 'FREEBET_PAYOUT', 'NORMAL', 560,
    'BRL', 'test_fb_ok_' || v_ap, 'lucro freebet vai para saldo real'
  );

  -- (2) FREEBET_PAYOUT com tipo_uso='FREEBET' deve ser BLOQUEADO pelo guardrail
  BEGIN
    INSERT INTO financial_events (
      workspace_id, bookmaker_id, aposta_id, user_id, tipo_evento, tipo_uso, valor,
      moeda, idempotency_key, descricao
    ) VALUES (
      v_ws, v_bk, v_ap, v_user, 'FREEBET_PAYOUT', 'FREEBET', 560,
      'BRL', 'test_fb_bad_' || v_ap, 'deve ser barrado'
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'Guardrail chk_freebet_payout_tipo_uso_normal NÃO bloqueou FREEBET_PAYOUT com tipo_uso=FREEBET';
  END IF;

  RAISE NOTICE '✅ 05_surebet_freebet_snr_payout_normal: OK (aceita NORMAL, bloqueia FREEBET)';
END $$;

ROLLBACK;