
-- =================================================================
-- CORREÇÃO: reliquidar_aposta_v5 (manter assinatura original)
-- =================================================================

DROP FUNCTION IF EXISTS public.reliquidar_aposta_v5(UUID, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.reliquidar_aposta_v5(
  p_aposta_id UUID,
  p_novo_resultado TEXT,
  p_novo_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, events_created INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_evento RECORD;
  v_event_count INTEGER := 0;
  v_novo_payout NUMERIC := 0;
  v_tipo_evento TEXT;
  v_tipo_uso TEXT;
BEGIN
  -- Buscar aposta atual
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;
  
  IF v_aposta.status != 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não está liquidada'::TEXT;
    RETURN;
  END IF;
  
  -- Se o resultado é o mesmo, não fazer nada
  IF v_aposta.resultado = p_novo_resultado THEN
    RETURN QUERY SELECT TRUE, 0, 'Resultado igual, nenhuma alteração necessária'::TEXT;
    RETURN;
  END IF;
  
  -- Determinar tipo de uso
  IF v_aposta.fonte_saldo = 'FREEBET' OR v_aposta.usar_freebet THEN
    v_tipo_uso := 'FREEBET';
  ELSE
    v_tipo_uso := 'NORMAL';
  END IF;
  
  -- ================================================================
  -- REVERTER APENAS EVENTOS DE OUTCOME (PAYOUT, VOID_REFUND)
  -- NÃO reverter STAKE - ele permanece inalterado
  -- ================================================================
  FOR v_evento IN 
    SELECT * FROM financial_events 
    WHERE aposta_id = p_aposta_id 
      AND tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
      AND reversed_event_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM financial_events fe2 
        WHERE fe2.reversed_event_id = financial_events.id
      )
  LOOP
    -- Criar evento de reversão
    -- ⚠️ v9.2: Apenas INSERT, trigger cuida do saldo
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, reversed_event_id, idempotency_key, descricao,
      processed_at, created_by
    ) VALUES (
      v_evento.bookmaker_id,
      v_evento.aposta_id,
      v_evento.workspace_id,
      'REVERSAL',
      v_evento.tipo_uso,
      -v_evento.valor,
      v_evento.moeda,
      v_evento.id,
      'reversal_' || v_evento.id::TEXT,
      format('Reversão de %s para re-liquidação', v_evento.tipo_evento),
      now(),
      auth.uid()
    );
    
    v_event_count := v_event_count + 1;
  END LOOP;
  
  -- ================================================================
  -- CALCULAR E CRIAR NOVO PAYOUT
  -- ================================================================
  CASE p_novo_resultado
    WHEN 'GREEN' THEN
      IF v_tipo_uso = 'FREEBET' THEN
        v_novo_payout := v_aposta.stake * (v_aposta.odd - 1);
        v_tipo_evento := 'FREEBET_PAYOUT';
      ELSE
        v_novo_payout := v_aposta.stake * v_aposta.odd;
        v_tipo_evento := 'PAYOUT';
      END IF;
      
    WHEN 'RED' THEN
      v_novo_payout := 0;
      v_tipo_evento := NULL;
      
    WHEN 'VOID' THEN
      v_novo_payout := v_aposta.stake;
      v_tipo_evento := 'VOID_REFUND';
      
    WHEN 'MEIO_GREEN' THEN
      IF v_tipo_uso = 'FREEBET' THEN
        v_novo_payout := v_aposta.stake * (v_aposta.odd - 1) / 2;
        v_tipo_evento := 'FREEBET_PAYOUT';
      ELSE
        v_novo_payout := v_aposta.stake + (v_aposta.stake * (v_aposta.odd - 1) / 2);
        v_tipo_evento := 'PAYOUT';
      END IF;
      
    WHEN 'MEIO_RED' THEN
      v_novo_payout := v_aposta.stake / 2;
      v_tipo_evento := 'VOID_REFUND';
      
    ELSE
      RETURN QUERY SELECT FALSE, 0, format('Resultado inválido: %s', p_novo_resultado)::TEXT;
      RETURN;
  END CASE;
  
  -- Criar novo evento de payout se aplicável
  IF v_tipo_evento IS NOT NULL AND v_novo_payout > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_aposta.bookmaker_id,
      v_aposta.id,
      v_aposta.workspace_id,
      v_tipo_evento,
      CASE WHEN v_tipo_evento LIKE 'FREEBET%' THEN 'NORMAL' ELSE v_tipo_uso END,
      'LUCRO',
      v_novo_payout,
      v_aposta.moeda_operacao,
      'payout_' || v_aposta.id::TEXT || '_' || p_novo_resultado || '_reliq_' || now()::TEXT,
      format('Payout %s (re-liquidação)', p_novo_resultado),
      now(),
      auth.uid()
    );
    
    v_event_count := v_event_count + 1;
  END IF;
  
  -- Atualizar aposta com novo resultado
  UPDATE apostas_unificada SET
    resultado = p_novo_resultado,
    lucro_prejuizo = COALESCE(
      p_novo_lucro_prejuizo,
      CASE
        WHEN p_novo_resultado = 'GREEN' THEN v_aposta.stake * (v_aposta.odd - 1)
        WHEN p_novo_resultado = 'RED' THEN -v_aposta.stake
        WHEN p_novo_resultado = 'VOID' THEN 0
        WHEN p_novo_resultado = 'MEIO_GREEN' THEN v_aposta.stake * (v_aposta.odd - 1) / 2
        WHEN p_novo_resultado = 'MEIO_RED' THEN -v_aposta.stake / 2
      END
    ),
    valor_retorno = v_novo_payout,
    updated_at = now()
  WHERE id = p_aposta_id;
  
  RETURN QUERY SELECT TRUE, v_event_count, 
    format('Re-liquidação: %s → %s', v_aposta.resultado, p_novo_resultado)::TEXT;
END;
$$;

COMMENT ON FUNCTION public.reliquidar_aposta_v5 IS 
'v9.2 - Apenas eventos financeiros, sem UPDATE direto em bookmakers.';
