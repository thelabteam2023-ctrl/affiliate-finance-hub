CREATE OR REPLACE FUNCTION public.deletar_aposta_v4(p_aposta_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
BEGIN
  -- 1. Lock aposta
  SELECT * INTO v_aposta FROM public.apostas_unificada au WHERE au.id = p_aposta_id FOR UPDATE;

  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;

  -- 2. Reverter eventos financeiros de forma granulada
  -- Em vez de um SUM cego, revertemos evento por evento para manter a integridade do ledger
  FOR v_event IN
    SELECT id, bookmaker_id, tipo_evento, valor, moeda, tipo_uso, workspace_id
    FROM public.financial_events
    WHERE aposta_id = p_aposta_id
      AND tipo_evento IN ('STAKE', 'PAYOUT', 'FREEBET_RETURN', 'VOID_REFUND', 'AJUSTE')
      -- Não reverter o que já for REVERSAL
  LOOP
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at
    ) VALUES (
      v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
      -v_event.valor, v_event.moeda,
      'del_rev_' || v_event.id || '_' || floor(extract(epoch from now())),
      v_event.id,
      format('Reversão por exclusão (%s)', v_event.tipo_evento),
      now()
    );
  END LOOP;

  -- 3. Limpeza de tabelas relacionadas
  DELETE FROM public.apostas_perna_entradas ape 
  USING public.apostas_pernas ap 
  WHERE ape.perna_id = ap.id AND ap.aposta_id = p_aposta_id;

  DELETE FROM public.apostas_pernas ap WHERE ap.aposta_id = p_aposta_id;
  DELETE FROM public.apostas_unificada au WHERE au.id = p_aposta_id;

  RETURN QUERY SELECT TRUE, 'Aposta excluída e saldo recuperado com sucesso'::TEXT;
END;
$$;
