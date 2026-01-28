
-- ============================================================================
-- FINANCIAL ENGINE v9 - Trigger Universal em financial_events
-- ============================================================================
-- Primeiro dropar funções com assinatura diferente

-- Drop funções existentes para recriar com nova assinatura
DROP FUNCTION IF EXISTS public.reverter_liquidacao_v4(uuid);
DROP FUNCTION IF EXISTS public.deletar_aposta_v4(uuid);

-- ============================================================================
-- 1. FUNÇÃO: Sincroniza saldo automaticamente quando evento é inserido
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_financial_events_sync_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_delta NUMERIC;
BEGIN
  -- Só processa INSERT (eventos são imutáveis)
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- Calcular delta baseado no tipo de evento
  CASE NEW.tipo_evento
    -- Débitos (stake sai do saldo)
    WHEN 'STAKE' THEN
      v_delta := -NEW.valor;
    WHEN 'FREEBET_STAKE' THEN
      v_delta := -NEW.valor;
      
    -- Créditos (payout entra no saldo)
    WHEN 'PAYOUT', 'VOID_REFUND', 'DEPOSITO', 'BONUS', 'CASHBACK', 'FREEBET_CREDIT', 'FREEBET_PAYOUT' THEN
      v_delta := NEW.valor;
      
    -- Ajuste pode ser positivo ou negativo
    WHEN 'AJUSTE' THEN
      v_delta := NEW.valor;
      
    -- Saque é débito (valor já vem negativo)
    WHEN 'SAQUE' THEN
      v_delta := NEW.valor;
      
    -- Reversão inverte o evento original
    WHEN 'REVERSAL' THEN
      v_delta := NEW.valor;
      
    -- Expiração de freebet
    WHEN 'FREEBET_EXPIRE' THEN
      v_delta := NEW.valor;
      
    ELSE
      v_delta := 0;
  END CASE;
  
  -- Aplicar delta no saldo correto
  IF NEW.tipo_uso = 'FREEBET' THEN
    UPDATE bookmakers 
    SET saldo_freebet = saldo_freebet + v_delta,
        updated_at = now()
    WHERE id = NEW.bookmaker_id;
  ELSE
    UPDATE bookmakers 
    SET saldo_atual = saldo_atual + v_delta,
        updated_at = now()
    WHERE id = NEW.bookmaker_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. TRIGGER: Dispara após INSERT em financial_events
DROP TRIGGER IF EXISTS tr_financial_events_sync_balance ON financial_events;
CREATE TRIGGER tr_financial_events_sync_balance
  AFTER INSERT ON financial_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_financial_events_sync_balance();

-- ============================================================================
-- 3. FUNÇÃO AUXILIAR: Cria evento de reversão padronizado
-- ============================================================================
CREATE OR REPLACE FUNCTION create_reversal_event(
  p_original_event_id UUID,
  p_reason TEXT DEFAULT 'Reversão'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_original RECORD;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_original FROM financial_events WHERE id = p_original_event_id;
  
  IF v_original.id IS NULL THEN
    RAISE EXCEPTION 'Evento original não encontrado: %', p_original_event_id;
  END IF;
  
  IF EXISTS (SELECT 1 FROM financial_events WHERE reversed_event_id = p_original_event_id) THEN
    RAISE EXCEPTION 'Evento já foi revertido: %', p_original_event_id;
  END IF;
  
  INSERT INTO financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, reversed_event_id, descricao, 
    processed_at, created_by
  ) VALUES (
    v_original.bookmaker_id,
    v_original.aposta_id,
    v_original.workspace_id,
    'REVERSAL',
    v_original.tipo_uso,
    -v_original.valor,
    v_original.moeda,
    'reversal_' || p_original_event_id::TEXT,
    p_original_event_id,
    p_reason,
    now(),
    auth.uid()
  )
  RETURNING id INTO v_new_id;
  
  RETURN v_new_id;
END;
$$;

-- ============================================================================
-- 4. deletar_aposta_v4 - SEM UPDATE DIRETO (trigger cuida)
-- ============================================================================
CREATE FUNCTION public.deletar_aposta_v4(p_aposta_id uuid)
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
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;

  v_aposta_id_str := p_aposta_id::TEXT;
  
  -- Se liquidada, reverter PAYOUTS primeiro
  IF v_aposta.status = 'LIQUIDADA' THEN
    FOR v_event IN 
      SELECT * FROM financial_events 
      WHERE aposta_id = p_aposta_id 
        AND tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
        AND NOT EXISTS (
          SELECT 1 FROM financial_events r 
          WHERE r.reversed_event_id = financial_events.id
        )
    LOOP
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, reversed_event_id, descricao, 
        processed_at, created_by
      ) VALUES (
        v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
        -v_event.valor, v_event.moeda,
        'reversal_payout_delete_' || v_event.id::TEXT,
        v_event.id,
        'Reversão de payout por exclusão', now(), auth.uid()
      );
      -- Trigger atualiza saldo automaticamente
    END LOOP;
  END IF;
  
  -- Reverter stakes
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
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id, descricao, 
      processed_at, created_by
    ) VALUES (
      v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
      -v_event.valor, v_event.moeda,
      'reversal_stake_delete_' || v_event.id::TEXT,
      v_event.id,
      'Reversão de stake por exclusão', now(), auth.uid()
    );
    -- Trigger atualiza saldo automaticamente
  END LOOP;
  
  DELETE FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  DELETE FROM apostas_unificada WHERE id = p_aposta_id;
  
  RETURN QUERY SELECT TRUE, 'Aposta excluída com sucesso'::TEXT;
END;
$function$;

-- ============================================================================
-- 5. reverter_liquidacao_v4 - SEM UPDATE DIRETO (trigger cuida)
-- ============================================================================
CREATE FUNCTION public.reverter_liquidacao_v4(p_aposta_id uuid)
RETURNS TABLE(success boolean, message text, reversals_created integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT, 0;
    RETURN;
  END IF;
  
  IF v_aposta.status != 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 'Aposta não está liquidada'::TEXT, 0;
    RETURN;
  END IF;
  
  -- Reverter eventos de resultado
  FOR v_event IN 
    SELECT * FROM financial_events 
    WHERE aposta_id = p_aposta_id 
      AND tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
      AND NOT EXISTS (
        SELECT 1 FROM financial_events r 
        WHERE r.reversed_event_id = financial_events.id
      )
  LOOP
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id, descricao, 
      processed_at, created_by
    ) VALUES (
      v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
      -v_event.valor, v_event.moeda,
      'reversal_' || v_event.id::TEXT,
      v_event.id,
      'Reversão de liquidação', now(), auth.uid()
    );
    -- Trigger atualiza saldo automaticamente
    v_count := v_count + 1;
  END LOOP;
  
  UPDATE apostas_unificada 
  SET status = 'PENDENTE',
      resultado = NULL,
      lucro_prejuizo = NULL,
      updated_at = now()
  WHERE id = p_aposta_id;
  
  UPDATE apostas_pernas
  SET resultado = NULL,
      lucro_prejuizo = NULL,
      updated_at = now()
  WHERE aposta_id = p_aposta_id;
  
  RETURN QUERY SELECT TRUE, 'Liquidação revertida com sucesso'::TEXT, v_count;
END;
$function$;

-- ============================================================================
-- 6. COMENTÁRIOS
-- ============================================================================
COMMENT ON FUNCTION fn_financial_events_sync_balance() IS 
'Financial Engine v9 - Trigger que sincroniza saldos automaticamente ao inserir eventos.';

COMMENT ON FUNCTION create_reversal_event(UUID, TEXT) IS
'Função auxiliar para criar eventos de reversão padronizados.';
