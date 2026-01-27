-- ============================================================
-- FIX: reverter_liquidacao_v4 - Buscar eventos por idempotency_key como fallback
-- 
-- BUG: Eventos criados com aposta_id = NULL (código legado ou auto-heal)
-- não são encontrados na reversão. A solução é buscar também por
-- idempotency_key que contém o ID da aposta.
-- ============================================================

CREATE OR REPLACE FUNCTION reverter_liquidacao_v4(
  p_aposta_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  reversals_created INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
  v_reversals INTEGER := 0;
  v_aposta_id_str TEXT;
BEGIN
  -- Buscar aposta
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;
  
  IF v_aposta.status != 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não está liquidada'::TEXT;
    RETURN;
  END IF;

  v_aposta_id_str := p_aposta_id::TEXT;
  
  -- Reverter cada evento da aposta que ainda não foi revertido
  -- BUSCA DUPLA: por aposta_id OU por idempotency_key contendo o ID da aposta
  FOR v_event IN 
    SELECT * FROM financial_events 
    WHERE (
      aposta_id = p_aposta_id 
      OR idempotency_key LIKE 'stake_' || v_aposta_id_str || '%'
      OR idempotency_key LIKE 'payout_' || v_aposta_id_str || '%'
    )
    AND tipo_evento != 'REVERSAL'
    AND NOT EXISTS (
      SELECT 1 FROM financial_events r 
      WHERE r.reversed_event_id = financial_events.id
    )
  LOOP
    -- Criar evento de reversão
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at, created_by
    ) VALUES (
      v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
      -v_event.valor, v_event.moeda, 
      'reversal_' || v_event.id::TEXT,
      v_event.id,
      format('Reversão de %s', v_event.tipo_evento), now(), auth.uid()
    );
    
    -- Atualizar saldo (inverso do evento original)
    IF v_event.tipo_uso = 'FREEBET' THEN
      UPDATE bookmakers SET saldo_freebet = saldo_freebet - v_event.valor WHERE id = v_event.bookmaker_id;
    ELSE
      UPDATE bookmakers SET saldo_atual = saldo_atual - v_event.valor WHERE id = v_event.bookmaker_id;
    END IF;
    
    v_reversals := v_reversals + 1;
  END LOOP;
  
  -- Voltar aposta para PENDENTE
  UPDATE apostas_unificada SET
    status = 'PENDENTE',
    resultado = 'PENDENTE',
    lucro_prejuizo = NULL,
    valor_retorno = NULL,
    updated_at = now()
  WHERE id = p_aposta_id;
  
  RETURN QUERY SELECT TRUE, v_reversals, format('%s eventos revertidos', v_reversals)::TEXT;
END;
$$;

-- ============================================================
-- FIX: deletar_aposta_v4 - Mesma correção para buscar por idempotency_key
-- ============================================================

CREATE OR REPLACE FUNCTION deletar_aposta_v4(
  p_aposta_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
  v_aposta_id_str TEXT;
BEGIN
  -- Buscar aposta
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;

  v_aposta_id_str := p_aposta_id::TEXT;
  
  -- Se estava liquidada, reverter primeiro
  IF v_aposta.status = 'LIQUIDADA' THEN
    PERFORM * FROM reverter_liquidacao_v4(p_aposta_id);
  END IF;
  
  -- Reverter stake (evento STAKE ou FREEBET_STAKE)
  FOR v_event IN 
    SELECT * FROM financial_events 
    WHERE (
      aposta_id = p_aposta_id 
      OR idempotency_key = 'stake_' || v_aposta_id_str
    )
    AND tipo_evento IN ('STAKE', 'FREEBET_STAKE')
    AND NOT EXISTS (
      SELECT 1 FROM financial_events r 
      WHERE r.reversed_event_id = financial_events.id
    )
  LOOP
    -- Criar reversão do stake
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at, created_by
    ) VALUES (
      v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
      -v_event.valor, v_event.moeda,
      'reversal_delete_' || v_event.id::TEXT,
      v_event.id,
      'Reversão de stake por exclusão de aposta', now(), auth.uid()
    );
    
    -- Devolver ao saldo
    IF v_event.tipo_uso = 'FREEBET' THEN
      UPDATE bookmakers SET saldo_freebet = saldo_freebet - v_event.valor WHERE id = v_event.bookmaker_id;
    ELSE
      UPDATE bookmakers SET saldo_atual = saldo_atual - v_event.valor WHERE id = v_event.bookmaker_id;
    END IF;
  END LOOP;
  
  -- Deletar pernas (se arbitragem)
  DELETE FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  
  -- Deletar aposta
  DELETE FROM apostas_unificada WHERE id = p_aposta_id;
  
  RETURN QUERY SELECT TRUE, 'Aposta excluída com sucesso'::TEXT;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION reverter_liquidacao_v4(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION deletar_aposta_v4(UUID) TO authenticated;