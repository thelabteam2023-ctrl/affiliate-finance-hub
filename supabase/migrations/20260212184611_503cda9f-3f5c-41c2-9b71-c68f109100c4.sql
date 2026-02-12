
-- Fix deletar_aposta_v4: use NET sum approach instead of reversing individual events
-- This prevents double-reversal when reliquidation reversals don't use reversed_event_id
CREATE OR REPLACE FUNCTION public.deletar_aposta_v4(p_aposta_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_net RECORD;
BEGIN
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;

  -- Calculate NET impact per bookmaker from ALL events (stakes, payouts, reversals, adjustments)
  -- and create a single reversal to zero it out
  FOR v_net IN
    SELECT 
      fe.bookmaker_id,
      fe.workspace_id,
      fe.moeda,
      fe.tipo_uso,
      SUM(fe.valor) AS net_impact
    FROM financial_events fe
    WHERE (
      fe.aposta_id = p_aposta_id
      OR fe.idempotency_key = 'stake_' || p_aposta_id::TEXT
      OR fe.idempotency_key LIKE 'stake_' || p_aposta_id::TEXT || '_%'
      OR fe.idempotency_key LIKE 'surebet_stake_' || p_aposta_id::TEXT || '%'
      OR fe.idempotency_key LIKE 'liq_perna_%' || '_pay_%'
      OR fe.idempotency_key LIKE 'liq_perna_%' || '_rev_%'
      OR fe.idempotency_key LIKE 'payout_' || p_aposta_id::TEXT || '%'
      OR fe.idempotency_key LIKE 'reliq_' || p_aposta_id::TEXT || '%'
    )
    AND fe.aposta_id = p_aposta_id  -- Safety: only events linked to this bet
    GROUP BY fe.bookmaker_id, fe.workspace_id, fe.moeda, fe.tipo_uso
    HAVING SUM(fe.valor) <> 0
  LOOP
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, descricao, 
      processed_at, created_by
    ) VALUES (
      v_net.bookmaker_id, p_aposta_id, v_net.workspace_id, 'REVERSAL', v_net.tipo_uso,
      -v_net.net_impact, v_net.moeda,
      'net_reversal_delete_' || p_aposta_id::TEXT || '_' || v_net.bookmaker_id::TEXT || '_' || v_net.tipo_uso,
      'Reversão líquida por exclusão (net=' || v_net.net_impact || ')', 
      now(), auth.uid()
    );
  END LOOP;
  
  DELETE FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  DELETE FROM apostas_unificada WHERE id = p_aposta_id;
  
  RETURN QUERY SELECT TRUE, 'Aposta excluída com sucesso'::TEXT;
END;
$$;
