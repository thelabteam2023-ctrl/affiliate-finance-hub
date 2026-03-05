CREATE OR REPLACE FUNCTION public.process_financial_event(
  p_bookmaker_id uuid,
  p_aposta_id uuid DEFAULT NULL,
  p_tipo_evento text DEFAULT 'AJUSTE',
  p_tipo_uso text DEFAULT 'NORMAL',
  p_origem text DEFAULT NULL,
  p_valor numeric DEFAULT 0,
  p_moeda text DEFAULT 'BRL',
  p_idempotency_key text DEFAULT NULL,
  p_reversed_event_id uuid DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Insert event
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

  -- CRITICAL FIX: Actually update bookmaker balance based on tipo_uso
  IF p_tipo_uso = 'FREEBET' THEN
    UPDATE bookmakers 
    SET saldo_freebet = GREATEST(0, saldo_freebet + p_valor),
        updated_at = now()
    WHERE id = p_bookmaker_id;
  ELSE
    UPDATE bookmakers 
    SET saldo_atual = saldo_atual + p_valor,
        updated_at = now()
    WHERE id = p_bookmaker_id;
  END IF;

  SELECT saldo_atual, saldo_freebet INTO v_saldo_atual, v_saldo_freebet FROM bookmakers WHERE id = p_bookmaker_id;

  RETURN jsonb_build_object('success', true, 'event_id', v_event_id, 'saldo_atual', v_saldo_atual, 'saldo_freebet', v_saldo_freebet);
END;
$$;