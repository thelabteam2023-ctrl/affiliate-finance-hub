-- ============================================================
-- HARD RESET LEDGER MY EMPIRE
-- ============================================================
DO $$
DECLARE
  v_bookmaker_id UUID := '66b9fb1a-7c24-4efb-b37f-7f15d831d4fd';
  v_workspace_id UUID;
  v_saldo_anterior NUMERIC;
  v_eventos_apagados INTEGER;
BEGIN
  SELECT workspace_id, saldo_atual INTO v_workspace_id, v_saldo_anterior
  FROM bookmakers WHERE id = v_bookmaker_id;

  -- Apagar TODOS os eventos do bookmaker
  WITH del AS (
    DELETE FROM financial_events WHERE bookmaker_id = v_bookmaker_id RETURNING 1
  )
  SELECT COUNT(*) INTO v_eventos_apagados FROM del;

  -- Inserir baseline limpo de US$ 100
  INSERT INTO financial_events (
    bookmaker_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, processed_at, allow_negative
  ) VALUES (
    v_bookmaker_id, v_workspace_id, 'DEPOSITO', 'NORMAL',
    100, 'USD',
    'hard_reset_my_empire_2026_04_20_baseline',
    'Hard reset: baseline US$ 100 (saldo correto pós-limpeza de ledger contaminado)',
    now(), true
  );

  -- Forçar saldo correto
  UPDATE bookmakers
  SET saldo_atual = 100,
      saldo_freebet = 0,
      updated_at = now()
  WHERE id = v_bookmaker_id;

  -- Auditoria do reset
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
    origem, observacoes
  ) VALUES (
    v_bookmaker_id, v_workspace_id,
    v_saldo_anterior, 100,
    'HARD_RESET_LEDGER',
    format('Hard reset do ledger MY EMPIRE: %s eventos apagados, baseline restaurado para US$ 100', v_eventos_apagados)
  );
END$$;