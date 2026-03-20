
-- Atualizar RPC criar_surebet_atomica para suportar fonte_saldo por perna
CREATE OR REPLACE FUNCTION public.criar_surebet_atomica(
  p_workspace_id UUID,
  p_user_id UUID,
  p_projeto_id UUID,
  p_evento TEXT,
  p_esporte TEXT DEFAULT NULL,
  p_mercado TEXT DEFAULT NULL,
  p_modelo TEXT DEFAULT NULL,
  p_estrategia TEXT DEFAULT 'SUREBET',
  p_contexto_operacional TEXT DEFAULT 'NORMAL',
  p_data_aposta TEXT DEFAULT NULL,
  p_pernas JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE(success BOOLEAN, aposta_id UUID, events_created INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta_id UUID;
  v_perna JSONB;
  v_perna_idx INTEGER := 0;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_moeda TEXT;
  v_selecao TEXT;
  v_selecao_livre TEXT;
  v_saldo_atual NUMERIC;
  v_saldo_freebet NUMERIC;
  v_bookmaker_status TEXT;
  v_stake_total NUMERIC := 0;
  v_events_created INTEGER := 0;
  v_perna_id UUID;
  v_event_id UUID;
  v_roi_esperado NUMERIC;
  v_lucro_esperado NUMERIC;
  v_inverse_sum NUMERIC := 0;
  v_cotacao_snapshot NUMERIC;
  v_stake_brl_referencia NUMERIC;
  v_fonte_saldo TEXT;
BEGIN
  -- ================================================================
  -- ETAPA 1: VALIDAR TODAS AS PERNAS
  -- ================================================================
  
  IF jsonb_array_length(p_pernas) < 2 THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
      'Surebet requer no mínimo 2 pernas'::TEXT;
    RETURN;
  END IF;

  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas)
  LOOP
    v_perna_idx := v_perna_idx + 1;
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_odd := (v_perna->>'odd')::NUMERIC;
    v_fonte_saldo := COALESCE(v_perna->>'fonte_saldo', 'REAL');
    
    SELECT b.saldo_atual, b.saldo_freebet, b.status 
    INTO v_saldo_atual, v_saldo_freebet, v_bookmaker_status
    FROM bookmakers b
    WHERE b.id = v_bookmaker_id 
      AND b.workspace_id = p_workspace_id;
    
    IF NOT FOUND THEN
      RETURN QUERY SELECT 
        FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
        format('Perna %s: Bookmaker não encontrada', v_perna_idx)::TEXT;
      RETURN;
    END IF;
    
    IF LOWER(v_bookmaker_status) NOT IN ('ativo', 'limitada') THEN
      RETURN QUERY SELECT 
        FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
        format('Perna %s: Bookmaker com status "%s" não permite apostas', v_perna_idx, v_bookmaker_status)::TEXT;
      RETURN;
    END IF;
    
    -- Validar saldo correto baseado na fonte
    IF v_fonte_saldo = 'FREEBET' THEN
      IF v_stake > COALESCE(v_saldo_freebet, 0) THEN
        RETURN QUERY SELECT 
          FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
          format('Perna %s: Saldo freebet insuficiente (stake: %s, disponível: %s)', v_perna_idx, v_stake, COALESCE(v_saldo_freebet, 0))::TEXT;
        RETURN;
      END IF;
    ELSE
      IF v_stake > v_saldo_atual THEN
        RETURN QUERY SELECT 
          FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
          format('Perna %s: Saldo insuficiente (stake: %s, disponível: %s)', v_perna_idx, v_stake, v_saldo_atual)::TEXT;
        RETURN;
      END IF;
    END IF;
    
    v_stake_total := v_stake_total + v_stake;
    v_inverse_sum := v_inverse_sum + (1.0 / v_odd);
  END LOOP;
  
  v_roi_esperado := (1.0 - v_inverse_sum) * 100;
  v_lucro_esperado := v_stake_total * (v_roi_esperado / 100);

  -- ================================================================
  -- ETAPA 2: INSERIR REGISTRO PAI
  -- ================================================================
  
  INSERT INTO apostas_unificada (
    workspace_id, user_id, projeto_id,
    forma_registro, estrategia, contexto_operacional,
    evento, esporte, mercado, modelo,
    data_aposta, stake_total, lucro_esperado, roi_esperado,
    status, resultado
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id,
    'ARBITRAGEM', p_estrategia, p_contexto_operacional,
    p_evento, p_esporte, p_mercado, p_modelo,
    p_data_aposta, v_stake_total, v_lucro_esperado, v_roi_esperado,
    'PENDENTE', 'PENDENTE'
  )
  RETURNING id INTO v_aposta_id;

  -- ================================================================
  -- ETAPA 3: INSERIR PERNAS + GERAR EVENTOS STAKE
  -- ================================================================
  
  v_perna_idx := 0;
  
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas)
  LOOP
    v_perna_idx := v_perna_idx + 1;
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_odd := (v_perna->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_perna->>'moeda', 'BRL');
    v_selecao := COALESCE(v_perna->>'selecao', '');
    v_selecao_livre := v_perna->>'selecao_livre';
    v_cotacao_snapshot := (v_perna->>'cotacao_snapshot')::NUMERIC;
    v_stake_brl_referencia := (v_perna->>'stake_brl_referencia')::NUMERIC;
    v_fonte_saldo := COALESCE(v_perna->>'fonte_saldo', 'REAL');
    
    -- Inserir perna COM fonte_saldo
    INSERT INTO apostas_pernas (
      aposta_id, bookmaker_id, ordem, selecao, selecao_livre,
      odd, stake, moeda, cotacao_snapshot, stake_brl_referencia, 
      resultado, fonte_saldo
    ) VALUES (
      v_aposta_id, v_bookmaker_id, v_perna_idx, v_selecao, v_selecao_livre,
      v_odd, v_stake, v_moeda, v_cotacao_snapshot, v_stake_brl_referencia, 
      NULL, v_fonte_saldo
    )
    RETURNING id INTO v_perna_id;
    
    -- Gerar evento STAKE com tipo_uso baseado na fonte_saldo DA PERNA
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_id, v_aposta_id, p_workspace_id,
      'STAKE',
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
      'STAKE',
      -v_stake,
      v_moeda,
      'stake_' || v_aposta_id || '_leg' || v_perna_idx,
      'Stake Surebet Perna ' || v_perna_idx || CASE WHEN v_fonte_saldo = 'FREEBET' THEN ' (FB)' ELSE '' END,
      NOW(), p_user_id
    )
    RETURNING id INTO v_event_id;
    
    v_events_created := v_events_created + 1;
  END LOOP;

  RETURN QUERY SELECT 
    TRUE::BOOLEAN, v_aposta_id, v_events_created,
    format('Surebet criada com %s pernas', v_events_created)::TEXT;
    
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
      format('Erro: %s', SQLERRM)::TEXT;
END;
$$;
