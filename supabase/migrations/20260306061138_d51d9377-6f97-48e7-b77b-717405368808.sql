
-- FIX: Remove duplicate balance update from process_financial_event RPC.
-- The trigger 'tr_financial_events_sync_balance' on financial_events ALREADY
-- handles balance updates when a row is inserted. The RPC was ALSO doing
-- a direct UPDATE on bookmakers.saldo_freebet/saldo_atual, causing double-credit.

CREATE OR REPLACE FUNCTION public.process_financial_event(
  p_bookmaker_id uuid,
  p_aposta_id uuid DEFAULT NULL,
  p_tipo_evento text DEFAULT NULL,
  p_tipo_uso text DEFAULT 'NORMAL',
  p_origem text DEFAULT NULL,
  p_valor numeric DEFAULT 0,
  p_moeda text DEFAULT 'BRL',
  p_idempotency_key text DEFAULT NULL,
  p_reversed_event_id uuid DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_user_id uuid;
  v_event_id uuid;
  v_final_key text;
  v_saldo_atual numeric;
  v_saldo_freebet numeric;
BEGIN
  SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
  FROM bookmakers WHERE id = p_bookmaker_id;

  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker não encontrada');
  END IF;

  v_final_key := COALESCE(p_idempotency_key, gen_random_uuid()::text);

  -- Idempotency check
  SELECT id INTO v_event_id FROM financial_events WHERE idempotency_key = v_final_key;
  IF v_event_id IS NOT NULL THEN
    SELECT saldo_atual, saldo_freebet INTO v_saldo_atual, v_saldo_freebet FROM bookmakers WHERE id = p_bookmaker_id;
    RETURN jsonb_build_object('success', true, 'event_id', v_event_id, 'idempotent', true, 'saldo_atual', v_saldo_atual, 'saldo_freebet', v_saldo_freebet);
  END IF;

  -- Insert event (the trigger tr_financial_events_sync_balance handles balance update)
  INSERT INTO financial_events (
    bookmaker_id, aposta_id, workspace_id, created_by,
    tipo_evento, tipo_uso, origem, valor, moeda,
    idempotency_key, reversed_event_id, descricao, metadata
  ) VALUES (
    p_bookmaker_id, p_aposta_id, v_workspace_id, v_user_id,
    p_tipo_evento, p_tipo_uso, p_origem, p_valor, p_moeda,
    v_final_key, p_reversed_event_id, p_descricao, p_metadata
  )
  RETURNING id INTO v_event_id;

  -- NOTE: Balance update is handled by tr_financial_events_sync_balance trigger.
  -- DO NOT update bookmakers.saldo_atual or saldo_freebet here to avoid double-credit.

  SELECT saldo_atual, saldo_freebet INTO v_saldo_atual, v_saldo_freebet FROM bookmakers WHERE id = p_bookmaker_id;

  RETURN jsonb_build_object('success', true, 'event_id', v_event_id, 'saldo_atual', v_saldo_atual, 'saldo_freebet', v_saldo_freebet);
END;
$$;
