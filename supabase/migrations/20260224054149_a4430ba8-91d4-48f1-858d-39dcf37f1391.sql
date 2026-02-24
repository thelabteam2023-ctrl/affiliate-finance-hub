
-- ============================================================================
-- FIX: Remover UPDATE redundante da RPC process_financial_event
-- O trigger tr_financial_events_sync_balance já atualiza saldo corretamente.
-- Manter apenas o INSERT + validação na RPC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_financial_event(
  p_bookmaker_id UUID,
  p_aposta_id UUID DEFAULT NULL,
  p_tipo_evento TEXT DEFAULT NULL,
  p_tipo_uso TEXT DEFAULT 'NORMAL',
  p_origem TEXT DEFAULT NULL,
  p_valor NUMERIC DEFAULT 0,
  p_moeda TEXT DEFAULT 'BRL',
  p_idempotency_key TEXT DEFAULT NULL,
  p_reversed_event_id UUID DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL,
  p_metadata TEXT DEFAULT '{}'
)
RETURNS TABLE (
  success BOOLEAN,
  event_id UUID,
  new_balance NUMERIC,
  new_freebet_balance NUMERIC,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_user_id UUID;
  v_event_id UUID;
  v_current_saldo NUMERIC;
  v_current_freebet NUMERIC;
  v_new_saldo NUMERIC;
  v_new_freebet NUMERIC;
BEGIN
  -- Obter user_id
  v_user_id := auth.uid();
  
  -- Verificar idempotência
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_event_id 
    FROM financial_events 
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_event_id IS NOT NULL THEN
      -- Evento já existe, retornar silenciosamente
      SELECT saldo_atual, saldo_freebet INTO v_current_saldo, v_current_freebet
      FROM bookmakers WHERE id = p_bookmaker_id;
      
      RETURN QUERY SELECT 
        TRUE, 
        v_event_id, 
        v_current_saldo, 
        v_current_freebet,
        'Evento já processado (idempotente)'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Buscar bookmaker e bloquear para update
  SELECT b.workspace_id, b.saldo_atual, b.saldo_freebet 
  INTO v_workspace_id, v_current_saldo, v_current_freebet
  FROM bookmakers b
  WHERE b.id = p_bookmaker_id
  FOR UPDATE;
  
  IF v_workspace_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Bookmaker não encontrado'::TEXT;
    RETURN;
  END IF;
  
  -- Validar saldo suficiente para débitos
  IF p_valor < 0 THEN
    IF p_tipo_uso = 'FREEBET' THEN
      IF v_current_freebet + p_valor < 0 THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, v_current_saldo, v_current_freebet, 
          format('Saldo freebet insuficiente: %.2f disponível, %.2f necessário', v_current_freebet, ABS(p_valor))::TEXT;
        RETURN;
      END IF;
    ELSE
      IF v_current_saldo + p_valor < 0 THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, v_current_saldo, v_current_freebet,
          format('Saldo insuficiente: %.2f disponível, %.2f necessário', v_current_saldo, ABS(p_valor))::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;
  
  -- Calcular novos saldos (para retornar ao chamador)
  IF p_tipo_uso = 'FREEBET' THEN
    v_new_saldo := v_current_saldo;
    v_new_freebet := v_current_freebet + p_valor;
  ELSE
    v_new_saldo := v_current_saldo + p_valor;
    v_new_freebet := v_current_freebet;
  END IF;
  
  -- Inserir evento (o trigger tr_financial_events_sync_balance cuida do UPDATE de saldo)
  INSERT INTO financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, 
    origem, valor, moeda, idempotency_key, reversed_event_id,
    descricao, metadata, processed_at, created_by
  ) VALUES (
    p_bookmaker_id, p_aposta_id, v_workspace_id, p_tipo_evento, p_tipo_uso,
    p_origem, p_valor, p_moeda, p_idempotency_key, p_reversed_event_id,
    p_descricao, p_metadata::JSONB, now(), v_user_id
  ) RETURNING id INTO v_event_id;
  
  -- NÃO fazer UPDATE direto em bookmakers.saldo - o trigger já fez isso
  -- Apenas ler os valores atualizados para retornar
  SELECT b.saldo_atual, b.saldo_freebet
  INTO v_new_saldo, v_new_freebet
  FROM bookmakers b
  WHERE b.id = p_bookmaker_id;
  
  RETURN QUERY SELECT TRUE, v_event_id, v_new_saldo, v_new_freebet, NULL::TEXT;
END;
$$;
