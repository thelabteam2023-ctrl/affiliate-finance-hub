-- ============================================================
-- RPC: reverter_liquidacao_para_pendente
-- Reverte uma aposta liquidada para PENDENTE, estornando o ledger
-- ============================================================

CREATE OR REPLACE FUNCTION public.reverter_liquidacao_para_pendente(
  p_aposta_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_lucro_anterior NUMERIC;
  v_debito_bonus NUMERIC;
  v_debito_freebet NUMERIC;
  v_debito_real NUMERIC;
BEGIN
  -- Buscar aposta com lock
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;
  
  IF v_aposta.status = 'PENDENTE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_JA_PENDENTE');
  END IF;
  
  -- Buscar breakdown do débito original
  SELECT 
    COALESCE(cl.debito_bonus, 0),
    COALESCE(cl.debito_freebet, 0),
    COALESCE(cl.debito_real, 0)
  INTO v_debito_bonus, v_debito_freebet, v_debito_real
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = v_aposta.bookmaker_id
    AND cl.tipo_transacao = 'APOSTA_STAKE'
    AND cl.workspace_id = v_aposta.workspace_id
    AND cl.created_at >= v_aposta.created_at - INTERVAL '1 minute'
  ORDER BY cl.created_at DESC
  LIMIT 1;
  
  -- Fallback
  IF v_debito_bonus IS NULL THEN
    v_debito_bonus := COALESCE(v_aposta.stake_bonus, 0);
    v_debito_real := COALESCE(v_aposta.stake_real, v_aposta.stake);
    v_debito_freebet := 0;
  END IF;
  
  v_lucro_anterior := COALESCE(v_aposta.lucro_prejuizo, 0);
  
  -- REVERTER baseado no resultado anterior
  IF v_aposta.resultado IN ('GREEN', 'MEIO_GREEN') THEN
    -- GREEN/MEIO_GREEN: Foi creditado lucro + stake_real
    -- Precisamos DEBITAR o que foi creditado
    DECLARE
      v_retorno_creditado NUMERIC;
    BEGIN
      IF v_aposta.resultado = 'GREEN' THEN
        v_retorno_creditado := v_lucro_anterior + v_debito_real;
      ELSE -- MEIO_GREEN
        v_retorno_creditado := v_lucro_anterior + v_debito_real;
      END IF;
      
      UPDATE bookmakers
      SET saldo_atual = saldo_atual - v_retorno_creditado
      WHERE id = v_aposta.bookmaker_id;
      
      -- Auditoria
      INSERT INTO bookmaker_balance_audit (
        bookmaker_id, workspace_id, user_id, origem,
        saldo_anterior, saldo_novo, diferenca, observacoes, referencia_id, referencia_tipo
      )
      SELECT 
        v_aposta.bookmaker_id, v_aposta.workspace_id, v_aposta.user_id, 
        'REVERSAO_PARA_PENDENTE',
        b.saldo_atual + v_retorno_creditado, b.saldo_atual,
        -v_retorno_creditado,
        FORMAT('Reversão de %s para PENDENTE: desfeito crédito de %s', v_aposta.resultado, v_retorno_creditado),
        p_aposta_id, 'APOSTA'
      FROM bookmakers b WHERE b.id = v_aposta.bookmaker_id;
    END;
    
  ELSIF v_aposta.resultado IN ('VOID', 'REEMBOLSO') THEN
    -- VOID: Foi devolvido tudo
    -- Precisamos RE-DEBITAR os valores
    UPDATE bookmakers
    SET 
      saldo_bonus = COALESCE(saldo_bonus, 0) - v_debito_bonus,
      saldo_freebet = COALESCE(saldo_freebet, 0) - v_debito_freebet,
      saldo_atual = saldo_atual - v_debito_real
    WHERE id = v_aposta.bookmaker_id;
    
  ELSIF v_aposta.resultado = 'MEIO_RED' THEN
    -- MEIO_RED: Foi devolvido metade
    -- Precisamos RE-DEBITAR a metade devolvida
    UPDATE bookmakers
    SET 
      saldo_bonus = COALESCE(saldo_bonus, 0) - v_debito_bonus / 2,
      saldo_freebet = COALESCE(saldo_freebet, 0) - v_debito_freebet / 2,
      saldo_atual = saldo_atual - v_debito_real / 2
    WHERE id = v_aposta.bookmaker_id;
    
  END IF;
  -- RED: Nada foi creditado/devolvido, então nada a reverter no saldo
  
  -- Inserir registro de reversão no ledger
  INSERT INTO cash_ledger (
    workspace_id, user_id, tipo_transacao, status, moeda, tipo_moeda,
    valor, origem_bookmaker_id, impacta_caixa_operacional, descricao,
    data_transacao
  ) VALUES (
    v_aposta.workspace_id, v_aposta.user_id, 'APOSTA_REVERSAO', 'CONFIRMADO',
    COALESCE(v_aposta.moeda_operacao, 'BRL'), 'FIAT',
    v_lucro_anterior, v_aposta.bookmaker_id, true,
    FORMAT('Reversão: %s → PENDENTE (lucro anterior: %s)', v_aposta.resultado, v_lucro_anterior),
    CURRENT_DATE
  );
  
  -- Atualizar aposta para PENDENTE
  UPDATE apostas_unificada
  SET 
    status = 'PENDENTE',
    resultado = 'PENDENTE',
    lucro_prejuizo = NULL,
    valor_retorno = NULL,
    updated_at = NOW()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'resultado_anterior', v_aposta.resultado,
    'lucro_revertido', v_lucro_anterior
  );
END;
$$;

-- ============================================================
-- Melhorar liquidar_aposta_atomica_v2 para validar operações especiais
-- ============================================================

CREATE OR REPLACE FUNCTION public.liquidar_aposta_atomica_v2(
  p_aposta_id UUID,
  p_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_lucro_final NUMERIC;
  v_debito_bonus NUMERIC;
  v_debito_freebet NUMERIC;
  v_debito_real NUMERIC;
  v_is_special_operation BOOLEAN := false;
BEGIN
  -- Buscar aposta com lock
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;
  
  IF v_aposta.status = 'LIQUIDADA' THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_JA_LIQUIDADA');
  END IF;
  
  -- Detectar operações especiais (Lay, Exchange, Cobertura)
  v_is_special_operation := (
    v_aposta.lay_odd IS NOT NULL OR 
    v_aposta.lay_stake IS NOT NULL OR
    v_aposta.lay_liability IS NOT NULL OR
    v_aposta.lay_exchange IS NOT NULL OR
    v_aposta.estrategia IN ('EXTRACAO_FREEBET', 'EXTRACAO_BONUS')
  );
  
  -- VALIDAÇÃO CRÍTICA: Operações especiais DEVEM enviar lucro calculado
  IF v_is_special_operation AND p_lucro_prejuizo IS NULL AND p_resultado IN ('GREEN', 'MEIO_GREEN') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'LUCRO_OBRIGATORIO_PARA_OPERACAO_ESPECIAL',
      'message', 'Operações Lay/Exchange/Cobertura devem enviar lucro_prejuizo calculado'
    );
  END IF;
  
  -- Buscar breakdown do débito original do ledger
  SELECT 
    COALESCE(cl.debito_bonus, 0),
    COALESCE(cl.debito_freebet, 0),
    COALESCE(cl.debito_real, 0)
  INTO v_debito_bonus, v_debito_freebet, v_debito_real
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = v_aposta.bookmaker_id
    AND cl.tipo_transacao = 'APOSTA_STAKE'
    AND cl.workspace_id = v_aposta.workspace_id
    AND cl.created_at >= v_aposta.created_at - INTERVAL '1 minute'
  ORDER BY cl.created_at DESC
  LIMIT 1;
  
  -- Fallback para campos da aposta se ledger não encontrado
  IF v_debito_bonus IS NULL THEN
    v_debito_bonus := COALESCE(v_aposta.stake_bonus, 0);
    v_debito_real := COALESCE(v_aposta.stake_real, v_aposta.stake);
    v_debito_freebet := 0;
    
    -- Para Freebet/Bonus explícito, considerar stake como não-real
    IF v_aposta.fonte_saldo = 'FREEBET' THEN
      v_debito_freebet := v_aposta.stake;
      v_debito_real := 0;
    ELSIF v_aposta.fonte_saldo = 'BONUS' THEN
      v_debito_bonus := v_aposta.stake;
      v_debito_real := 0;
    END IF;
  END IF;
  
  -- Calcular lucro/prejuízo
  IF p_lucro_prejuizo IS NOT NULL THEN
    v_lucro_final := p_lucro_prejuizo;
  ELSIF p_resultado = 'GREEN' THEN
    v_lucro_final := v_aposta.stake * (v_aposta.odd - 1);
  ELSIF p_resultado = 'RED' THEN
    v_lucro_final := 0; -- Perda já foi debitada no waterfall
  ELSIF p_resultado IN ('VOID', 'REEMBOLSO') THEN
    v_lucro_final := 0;
    -- Devolver tudo que foi debitado
    UPDATE bookmakers
    SET 
      saldo_bonus = COALESCE(saldo_bonus, 0) + v_debito_bonus,
      saldo_freebet = COALESCE(saldo_freebet, 0) + v_debito_freebet,
      saldo_atual = saldo_atual + v_debito_real
    WHERE id = v_aposta.bookmaker_id;
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    v_lucro_final := v_aposta.stake * (v_aposta.odd - 1) / 2;
  ELSIF p_resultado = 'MEIO_RED' THEN
    v_lucro_final := 0;
    -- Devolver metade
    UPDATE bookmakers
    SET 
      saldo_bonus = COALESCE(saldo_bonus, 0) + v_debito_bonus / 2,
      saldo_freebet = COALESCE(saldo_freebet, 0) + v_debito_freebet / 2,
      saldo_atual = saldo_atual + v_debito_real / 2
    WHERE id = v_aposta.bookmaker_id;
  ELSE
    v_lucro_final := 0;
  END IF;
  
  -- Processar ganho (se GREEN ou MEIO_GREEN)
  IF p_resultado IN ('GREEN', 'MEIO_GREEN') AND v_lucro_final > 0 THEN
    PERFORM processar_credito_ganho(
      v_aposta.bookmaker_id,
      v_lucro_final,
      v_debito_bonus, v_debito_freebet, v_debito_real,
      v_aposta.workspace_id, v_aposta.user_id, p_aposta_id
    );
  END IF;
  
  -- Atualizar aposta
  UPDATE apostas_unificada
  SET 
    status = 'LIQUIDADA',
    resultado = p_resultado,
    lucro_prejuizo = CASE 
      WHEN p_resultado = 'RED' THEN -v_aposta.stake 
      WHEN p_resultado = 'MEIO_RED' THEN -v_aposta.stake / 2
      ELSE v_lucro_final 
    END,
    valor_retorno = CASE 
      WHEN p_resultado = 'GREEN' THEN v_aposta.stake + v_lucro_final
      WHEN p_resultado = 'MEIO_GREEN' THEN v_aposta.stake + v_lucro_final
      WHEN p_resultado IN ('VOID', 'REEMBOLSO') THEN v_aposta.stake
      WHEN p_resultado = 'MEIO_RED' THEN v_aposta.stake / 2
      ELSE 0
    END,
    updated_at = NOW()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'aposta_id', p_aposta_id,
    'resultado', p_resultado,
    'lucro_prejuizo', v_lucro_final,
    'is_special_operation', v_is_special_operation,
    'breakdown', jsonb_build_object(
      'debito_bonus', v_debito_bonus,
      'debito_freebet', v_debito_freebet,
      'debito_real', v_debito_real
    )
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.reverter_liquidacao_para_pendente(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.liquidar_aposta_atomica_v2(UUID, TEXT, NUMERIC) TO authenticated;