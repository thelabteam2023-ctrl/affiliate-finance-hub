
CREATE OR REPLACE FUNCTION public.criar_surebet_atomica(
  p_workspace_id UUID,
  p_user_id UUID,
  p_projeto_id UUID,
  p_estrategia TEXT DEFAULT 'SUREBET',
  p_contexto_operacional TEXT DEFAULT 'NORMAL',
  p_evento TEXT DEFAULT NULL,
  p_esporte TEXT DEFAULT NULL,
  p_mercado TEXT DEFAULT NULL,
  p_modelo TEXT DEFAULT NULL,
  p_pernas JSONB DEFAULT '[]',
  p_data_aposta TEXT DEFAULT NULL
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
  v_stake_real_total NUMERIC := 0;
  v_stake_freebet_total NUMERIC := 0;
  v_stake_total_normalizado NUMERIC := 0;
  v_stake_real_normalizado NUMERIC := 0;
  v_stake_freebet_normalizado NUMERIC := 0;
  v_events_created INTEGER := 0;
  v_perna_id UUID;
  v_event_id UUID;
  v_roi_esperado NUMERIC;
  v_lucro_esperado NUMERIC;
  v_inverse_sum NUMERIC := 0;
  v_cotacao_snapshot NUMERIC;
  v_stake_brl_referencia NUMERIC;
  v_fonte_saldo TEXT;
  v_data_aposta timestamptz;
  v_perna_stake_real NUMERIC;
  v_perna_stake_freebet NUMERIC;
  -- Multi-currency support
  v_moeda_consolidacao TEXT;
  v_cotacao_trabalho NUMERIC;
  v_is_multicurrency BOOLEAN := FALSE;
  v_first_moeda TEXT := NULL;
  v_moeda_operacao TEXT;
  v_stake_normalizado NUMERIC;
  v_fator_conversao NUMERIC;
BEGIN
  -- Parse data_aposta
  IF p_data_aposta IS NULL OR btrim(p_data_aposta) = '' THEN
    v_data_aposta := now();
  ELSE
    v_data_aposta := p_data_aposta::timestamptz;
  END IF;

  IF jsonb_array_length(p_pernas) < 2 THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
      'Surebet requer no mínimo 2 pernas'::TEXT;
    RETURN;
  END IF;

  -- Buscar configuração de moeda do projeto
  SELECT 
    COALESCE(pr.moeda_consolidacao, 'BRL'),
    COALESCE(pr.cotacao_trabalho, 5.0)
  INTO v_moeda_consolidacao, v_cotacao_trabalho
  FROM projetos pr
  WHERE pr.id = p_projeto_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
      'Projeto não encontrado'::TEXT;
    RETURN;
  END IF;

  -- Primeira passada: validar saldos, detectar multi-currency, acumular totais
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas)
  LOOP
    v_perna_idx := v_perna_idx + 1;
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_odd := (v_perna->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_perna->>'moeda', 'BRL');
    v_fonte_saldo := COALESCE(v_perna->>'fonte_saldo', 'REAL');
    
    -- Detectar multi-currency
    IF v_first_moeda IS NULL THEN
      v_first_moeda := v_moeda;
    ELSIF v_first_moeda <> v_moeda THEN
      v_is_multicurrency := TRUE;
    END IF;

    -- Validar bookmaker
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
    
    -- Validar saldo por fonte
    IF v_fonte_saldo = 'FREEBET' THEN
      IF v_stake > COALESCE(v_saldo_freebet, 0) THEN
        RETURN QUERY SELECT 
          FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
          format('Perna %s: Saldo freebet insuficiente (stake: %s, disponível: %s)', v_perna_idx, v_stake, COALESCE(v_saldo_freebet, 0))::TEXT;
        RETURN;
      END IF;
      v_stake_freebet_total := v_stake_freebet_total + v_stake;
    ELSE
      IF v_stake > v_saldo_atual THEN
        RETURN QUERY SELECT 
          FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
          format('Perna %s: Saldo insuficiente (stake: %s, disponível: %s)', v_perna_idx, v_stake, v_saldo_atual)::TEXT;
        RETURN;
      END IF;
      v_stake_real_total := v_stake_real_total + v_stake;
    END IF;
    
    -- Normalizar stake para moeda de consolidação
    v_stake_normalizado := v_stake;
    IF v_moeda <> v_moeda_consolidacao THEN
      -- Converter: se consolidação é USD e moeda é BRL, dividir pela cotação
      -- Se consolidação é BRL e moeda é USD, multiplicar pela cotação
      IF v_moeda_consolidacao = 'USD' THEN
        IF UPPER(v_moeda) = 'BRL' THEN
          v_stake_normalizado := v_stake / v_cotacao_trabalho;
        ELSIF UPPER(v_moeda) IN ('USD', 'USDT') THEN
          v_stake_normalizado := v_stake; -- Já em USD
        ELSE
          -- EUR, GBP, etc → tratar como 1:1 com USD por simplificação
          v_stake_normalizado := v_stake;
        END IF;
      ELSIF v_moeda_consolidacao = 'BRL' THEN
        IF UPPER(v_moeda) IN ('USD', 'USDT') THEN
          v_stake_normalizado := v_stake * v_cotacao_trabalho;
        ELSE
          v_stake_normalizado := v_stake;
        END IF;
      END IF;
    END IF;

    v_stake_total_normalizado := v_stake_total_normalizado + v_stake_normalizado;
    
    IF v_fonte_saldo = 'FREEBET' THEN
      v_stake_freebet_normalizado := v_stake_freebet_normalizado + v_stake_normalizado;
    ELSE
      v_stake_real_normalizado := v_stake_real_normalizado + v_stake_normalizado;
    END IF;
    
    v_inverse_sum := v_inverse_sum + (1.0 / v_odd);
  END LOOP;
  
  -- Determinar moeda_operacao
  IF v_is_multicurrency THEN
    v_moeda_operacao := v_moeda_consolidacao;
  ELSE
    v_moeda_operacao := v_first_moeda;
    -- Se moeda única, total normalizado = total direto
    v_stake_total_normalizado := v_stake_real_total + v_stake_freebet_total;
    v_stake_real_normalizado := v_stake_real_total;
    v_stake_freebet_normalizado := v_stake_freebet_total;
  END IF;

  v_roi_esperado := (1.0 - v_inverse_sum) * 100;
  v_lucro_esperado := v_stake_total_normalizado * (v_roi_esperado / 100);
  
  -- Inserir registro pai com totais normalizados
  INSERT INTO apostas_unificada (
    workspace_id, user_id, projeto_id,
    forma_registro, estrategia, contexto_operacional,
    evento, esporte, mercado, modelo,
    data_aposta, stake_total, stake_real, stake_freebet,
    moeda_operacao, is_multicurrency,
    lucro_esperado, roi_esperado,
    status, resultado
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id,
    'ARBITRAGEM', p_estrategia, p_contexto_operacional,
    p_evento, p_esporte, p_mercado, p_modelo,
    v_data_aposta, ROUND(v_stake_total_normalizado, 2), ROUND(v_stake_real_normalizado, 2), ROUND(v_stake_freebet_normalizado, 2),
    v_moeda_operacao, v_is_multicurrency,
    ROUND(v_lucro_esperado, 2), ROUND(v_roi_esperado, 4),
    'PENDENTE', 'PENDENTE'
  )
  RETURNING id INTO v_aposta_id;

  -- Segunda passada: inserir pernas e eventos financeiros
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

    -- Calcular split por perna
    IF v_fonte_saldo = 'FREEBET' THEN
      v_perna_stake_real := 0;
      v_perna_stake_freebet := v_stake;
    ELSE
      v_perna_stake_real := v_stake;
      v_perna_stake_freebet := 0;
    END IF;
    
    INSERT INTO apostas_pernas (
      aposta_id, bookmaker_id, ordem, selecao, selecao_livre,
      odd, stake, stake_real, stake_freebet,
      moeda, cotacao_snapshot, stake_brl_referencia, 
      resultado, fonte_saldo
    ) VALUES (
      v_aposta_id, v_bookmaker_id, v_perna_idx, v_selecao, v_selecao_livre,
      v_odd, v_stake, v_perna_stake_real, v_perna_stake_freebet,
      v_moeda, v_cotacao_snapshot, v_stake_brl_referencia, 
      NULL, v_fonte_saldo
    )
    RETURNING id INTO v_perna_id;
    
    -- Evento financeiro na moeda NATIVA da bookmaker (correto)
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
    format('Surebet criada com %s pernas (moeda: %s, multicurrency: %s)', v_events_created, v_moeda_operacao, v_is_multicurrency)::TEXT;
    
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
      format('Erro: %s', SQLERRM)::TEXT;
END;
$$;
