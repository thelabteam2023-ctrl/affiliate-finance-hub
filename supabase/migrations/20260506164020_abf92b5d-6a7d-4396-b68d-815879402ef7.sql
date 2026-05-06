-- Atualizar a função de sincronização para lidar com a transição de chaves
CREATE OR REPLACE FUNCTION public.fn_sync_stake_event_v1(
  p_entrada_id UUID,
  p_aposta_id UUID,
  p_workspace_id UUID,
  p_bookmaker_id UUID,
  p_stake NUMERIC,
  p_moeda TEXT,
  p_fonte_saldo TEXT,
  p_user_id UUID
) RETURNS VOID AS $$
DECLARE
  v_tipo_evento TEXT;
  v_tipo_uso TEXT;
  v_idempotency_key TEXT;
BEGIN
  v_tipo_evento := CASE WHEN p_fonte_saldo = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END;
  v_tipo_uso := CASE WHEN p_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END;
  v_idempotency_key := 'stake_entry_' || p_entrada_id;

  -- MIGRAR CHAVES ANTIGAS: Se existir um evento para esta entrada com chave no formato antigo, atualizamos para o novo
  UPDATE public.financial_events 
  SET idempotency_key = v_idempotency_key
  WHERE aposta_id = p_aposta_id 
    AND tipo_evento IN ('STAKE', 'FREEBET_STAKE')
    AND idempotency_key LIKE '%' || p_entrada_id || '%'
    AND idempotency_key != v_idempotency_key;

  INSERT INTO public.financial_events (
    bookmaker_id, workspace_id, aposta_id, tipo_evento, tipo_uso, valor, moeda, idempotency_key, descricao, created_by
  ) VALUES (
    p_bookmaker_id, p_workspace_id, p_aposta_id, v_tipo_evento, v_tipo_uso, -p_stake, p_moeda, v_idempotency_key, 
    'Stake de entrada (Surebet)', p_user_id
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    valor = EXCLUDED.valor,
    bookmaker_id = EXCLUDED.bookmaker_id,
    moeda = EXCLUDED.moeda,
    tipo_evento = EXCLUDED.tipo_evento,
    tipo_uso = EXCLUDED.tipo_uso,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
