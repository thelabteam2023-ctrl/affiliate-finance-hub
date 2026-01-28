
-- CORREÇÃO: deletar_aposta_v4 para suportar surebets multi-perna corretamente
-- Problemas:
-- 1. Pattern de busca não encontra stake_<id>_leg1/leg2/leg3
-- 2. Precisa reverter PAYOUT de surebets também

CREATE OR REPLACE FUNCTION public.deletar_aposta_v4(p_aposta_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  
  -- Se estava liquidada, reverter PAYOUTS primeiro
  IF v_aposta.status = 'LIQUIDADA' THEN
    -- Reverter todos os payouts (incluindo surebets multi-perna)
    FOR v_event IN 
      SELECT * FROM financial_events 
      WHERE aposta_id = p_aposta_id 
        AND tipo_evento IN ('PAYOUT', 'VOID_REFUND')
        AND NOT EXISTS (
          SELECT 1 FROM financial_events r 
          WHERE r.reversed_event_id = financial_events.id
        )
    LOOP
      -- Criar reversão do payout
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at, created_by
      ) VALUES (
        v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
        -v_event.valor, v_event.moeda,
        'reversal_payout_delete_' || v_event.id::TEXT,
        v_event.id,
        'Reversão de payout por exclusão', now(), auth.uid()
      );
      
      -- Subtrair o payout do saldo (payout era crédito, reversão é débito)
      UPDATE bookmakers SET saldo_atual = saldo_atual - v_event.valor, updated_at = now()
      WHERE id = v_event.bookmaker_id;
    END LOOP;
  END IF;
  
  -- Reverter stakes (evento STAKE ou FREEBET_STAKE)
  -- Suporta múltiplos patterns:
  -- 1. stake_<aposta_id> (aposta simples)
  -- 2. stake_<aposta_id>_leg1/leg2/leg3 (surebet via criar_surebet_atomica)
  -- 3. surebet_stake_<aposta_id>_<perna_id> (pattern alternativo)
  FOR v_event IN 
    SELECT * FROM financial_events 
    WHERE (
      aposta_id = p_aposta_id 
      OR idempotency_key = 'stake_' || v_aposta_id_str
      OR idempotency_key LIKE 'stake_' || v_aposta_id_str || '_%'
      OR idempotency_key LIKE 'surebet_stake_' || v_aposta_id_str || '%'
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
      'reversal_stake_delete_' || v_event.id::TEXT,
      v_event.id,
      'Reversão de stake por exclusão', now(), auth.uid()
    );
    
    -- Devolver ao saldo (stake era positivo no evento mas foi DEBITADO)
    IF v_event.tipo_uso = 'FREEBET' THEN
      UPDATE bookmakers SET saldo_freebet = saldo_freebet + v_event.valor, updated_at = now()
      WHERE id = v_event.bookmaker_id;
    ELSE
      UPDATE bookmakers SET saldo_atual = saldo_atual + v_event.valor, updated_at = now()
      WHERE id = v_event.bookmaker_id;
    END IF;
  END LOOP;
  
  -- Deletar pernas (se arbitragem)
  DELETE FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  
  -- Deletar aposta
  DELETE FROM apostas_unificada WHERE id = p_aposta_id;
  
  RETURN QUERY SELECT TRUE, 'Aposta excluída com sucesso'::TEXT;
END;
$function$;
