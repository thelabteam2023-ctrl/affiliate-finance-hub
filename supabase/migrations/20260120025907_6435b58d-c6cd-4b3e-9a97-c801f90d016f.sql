-- ============================================================================
-- RPC: atualizar_aposta_liquidada_atomica
-- 
-- Este RPC detecta mudanças em campos financeiramente impactantes de apostas
-- já liquidadas (bookmaker, stake, odd) e faz:
-- 1. Reversão financeira completa do impacto anterior
-- 2. Atualização dos dados da aposta
-- 3. Re-aplicação da liquidação com os novos dados
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atualizar_aposta_liquidada_atomica(
  p_aposta_id UUID,
  p_novo_bookmaker_id UUID DEFAULT NULL,
  p_novo_stake NUMERIC DEFAULT NULL,
  p_nova_odd NUMERIC DEFAULT NULL,
  p_novo_resultado TEXT DEFAULT NULL,
  p_nova_moeda TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_workspace_id UUID;
  v_user_id UUID;
  v_resultado_atual TEXT;
  v_bookmaker_anterior_id UUID;
  v_stake_anterior NUMERIC;
  v_odd_anterior NUMERIC;
  v_moeda_anterior TEXT;
  v_lucro_anterior NUMERIC;
  v_bookmaker_novo_id UUID;
  v_stake_novo NUMERIC;
  v_odd_novo NUMERIC;
  v_moeda_nova TEXT;
  v_resultado_novo TEXT;
  v_lucro_novo NUMERIC;
  v_houve_mudanca_financeira BOOLEAN := false;
  v_bookmaker_novo_moeda TEXT;
BEGIN
  -- ================================================================
  -- ETAPA 1: LOCK E VALIDAÇÃO
  -- ================================================================
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'APOSTA_NAO_ENCONTRADA'
    );
  END IF;
  
  -- Se não está liquidada, apenas atualizar normalmente (sem impacto financeiro)
  IF v_aposta.status != 'LIQUIDADA' THEN
    -- Atualiza campos se fornecidos
    UPDATE apostas_unificada
    SET 
      bookmaker_id = COALESCE(p_novo_bookmaker_id, bookmaker_id),
      stake = COALESCE(p_novo_stake, stake),
      odd = COALESCE(p_nova_odd, odd),
      moeda_operacao = COALESCE(p_nova_moeda, moeda_operacao),
      resultado = COALESCE(p_novo_resultado, resultado),
      updated_at = NOW()
    WHERE id = p_aposta_id;
    
    -- Atualizar perna correspondente se existir
    IF p_novo_bookmaker_id IS NOT NULL OR p_novo_stake IS NOT NULL OR p_nova_odd IS NOT NULL THEN
      UPDATE apostas_pernas
      SET 
        bookmaker_id = COALESCE(p_novo_bookmaker_id, bookmaker_id),
        stake = COALESCE(p_novo_stake, stake),
        odd = COALESCE(p_nova_odd, odd),
        moeda = COALESCE(p_nova_moeda, moeda),
        updated_at = NOW()
      WHERE aposta_id = p_aposta_id;
    END IF;
    
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Aposta não liquidada atualizada'
    );
  END IF;
  
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_resultado_atual := v_aposta.resultado;
  
  -- ================================================================
  -- ETAPA 2: PROCESSAR CADA PERNA
  -- Para apostas simples, terá 1 perna
  -- Para surebets/arbitragens, terá múltiplas pernas
  -- ================================================================
  FOR v_perna IN 
    SELECT ap.*, b.moeda as bookmaker_moeda
    FROM apostas_pernas ap
    JOIN bookmakers b ON b.id = ap.bookmaker_id
    WHERE ap.aposta_id = p_aposta_id
    ORDER BY ap.ordem
  LOOP
    -- Snapshot do estado anterior
    v_bookmaker_anterior_id := v_perna.bookmaker_id;
    v_stake_anterior := v_perna.stake;
    v_odd_anterior := v_perna.odd;
    v_moeda_anterior := COALESCE(v_perna.moeda, 'BRL');
    v_lucro_anterior := COALESCE(v_perna.lucro_prejuizo, 0);
    
    -- Determinar novos valores (usa fornecidos ou mantém atuais)
    -- Para apostas simples, aplica os parâmetros diretamente
    -- Para múltiplas pernas, só altera se for a primeira perna (simplificação)
    IF v_perna.ordem = 1 THEN
      v_bookmaker_novo_id := COALESCE(p_novo_bookmaker_id, v_bookmaker_anterior_id);
      v_stake_novo := COALESCE(p_novo_stake, v_stake_anterior);
      v_odd_novo := COALESCE(p_nova_odd, v_odd_anterior);
      v_moeda_nova := COALESCE(p_nova_moeda, v_moeda_anterior);
      v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);
    ELSE
      -- Para outras pernas, mantém valores atuais (podem ser atualizadas separadamente)
      v_bookmaker_novo_id := v_bookmaker_anterior_id;
      v_stake_novo := v_stake_anterior;
      v_odd_novo := v_odd_anterior;
      v_moeda_nova := v_moeda_anterior;
      v_resultado_novo := COALESCE(p_novo_resultado, v_perna.resultado);
    END IF;
    
    -- Verificar se houve mudança financeiramente relevante
    IF v_bookmaker_novo_id != v_bookmaker_anterior_id 
       OR v_stake_novo != v_stake_anterior 
       OR v_odd_novo != v_odd_anterior
       OR v_resultado_novo != v_perna.resultado THEN
      v_houve_mudanca_financeira := true;
    END IF;
    
    -- Se não houve mudança, pular esta perna
    IF v_bookmaker_novo_id = v_bookmaker_anterior_id 
       AND v_stake_novo = v_stake_anterior 
       AND v_odd_novo = v_odd_anterior
       AND v_resultado_novo = v_perna.resultado THEN
      CONTINUE;
    END IF;
    
    -- ================================================================
    -- ETAPA 3: REVERTER IMPACTO ANTERIOR NO BOOKMAKER ANTERIOR
    -- ================================================================
    IF v_perna.resultado = 'GREEN' THEN
      -- GREEN creditou stake + lucro, reverter debitando
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_REVERSAO',
        v_bookmaker_anterior_id, 'BOOKMAKER',
        v_stake_anterior + v_lucro_anterior,
        v_moeda_anterior,
        CASE WHEN v_moeda_anterior IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Reversão por edição de aposta - Bookmaker/Stake/Odd alterado',
        true
      );
      
    ELSIF v_perna.resultado = 'RED' THEN
      -- RED já confirmou perda do stake (saiu do saldo_em_aposta)
      -- Para reverter RED: devolver o stake ao bookmaker anterior
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_REVERSAO',
        v_bookmaker_anterior_id, 'BOOKMAKER',
        v_stake_anterior,
        v_moeda_anterior,
        CASE WHEN v_moeda_anterior IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Reversão RED por edição de aposta - Stake devolvido',
        true
      );
      
    ELSIF v_perna.resultado IN ('VOID', 'REEMBOLSO') THEN
      -- VOID devolveu stake, reverter debitando
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_REVERSAO',
        v_bookmaker_anterior_id, 'BOOKMAKER',
        v_stake_anterior,
        v_moeda_anterior,
        CASE WHEN v_moeda_anterior IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Reversão VOID por edição de aposta',
        true
      );
      
    ELSIF v_perna.resultado = 'MEIO_GREEN' THEN
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_REVERSAO',
        v_bookmaker_anterior_id, 'BOOKMAKER',
        v_stake_anterior + v_lucro_anterior,
        v_moeda_anterior,
        CASE WHEN v_moeda_anterior IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Reversão MEIO_GREEN por edição de aposta',
        true
      );
      
    ELSIF v_perna.resultado = 'MEIO_RED' THEN
      -- MEIO_RED: perdeu metade do stake
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_REVERSAO',
        v_bookmaker_anterior_id, 'BOOKMAKER',
        v_stake_anterior / 2,
        v_moeda_anterior,
        CASE WHEN v_moeda_anterior IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Reversão MEIO_RED por edição de aposta',
        true
      );
    END IF;
    
    -- ================================================================
    -- ETAPA 4: ATUALIZAR PERNA COM NOVOS DADOS
    -- ================================================================
    -- Calcular novo lucro/prejuízo
    IF v_resultado_novo = 'GREEN' THEN
      v_lucro_novo := v_stake_novo * (v_odd_novo - 1);
    ELSIF v_resultado_novo = 'RED' THEN
      v_lucro_novo := -v_stake_novo;
    ELSIF v_resultado_novo IN ('VOID', 'REEMBOLSO') THEN
      v_lucro_novo := 0;
    ELSIF v_resultado_novo = 'MEIO_GREEN' THEN
      v_lucro_novo := v_stake_novo * (v_odd_novo - 1) / 2;
    ELSIF v_resultado_novo = 'MEIO_RED' THEN
      v_lucro_novo := -v_stake_novo / 2;
    ELSE
      v_lucro_novo := 0;
    END IF;
    
    -- Buscar moeda do novo bookmaker
    SELECT moeda INTO v_bookmaker_novo_moeda
    FROM bookmakers
    WHERE id = v_bookmaker_novo_id;
    
    UPDATE apostas_pernas
    SET 
      bookmaker_id = v_bookmaker_novo_id,
      stake = v_stake_novo,
      odd = v_odd_novo,
      moeda = COALESCE(v_bookmaker_novo_moeda, v_moeda_nova),
      resultado = v_resultado_novo,
      lucro_prejuizo = v_lucro_novo,
      updated_at = NOW()
    WHERE id = v_perna.id;
    
    -- ================================================================
    -- ETAPA 5: APLICAR NOVA LIQUIDAÇÃO NO NOVO BOOKMAKER
    -- ================================================================
    IF v_resultado_novo = 'GREEN' THEN
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_GREEN',
        v_bookmaker_novo_id, 'BOOKMAKER',
        v_stake_novo + v_lucro_novo,
        COALESCE(v_bookmaker_novo_moeda, v_moeda_nova),
        CASE WHEN COALESCE(v_bookmaker_novo_moeda, v_moeda_nova) IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Re-liquidação após edição - GREEN',
        true
      );
      
    ELSIF v_resultado_novo = 'RED' THEN
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_RED',
        v_bookmaker_novo_id, 'BOOKMAKER',
        v_stake_novo,
        COALESCE(v_bookmaker_novo_moeda, v_moeda_nova),
        CASE WHEN COALESCE(v_bookmaker_novo_moeda, v_moeda_nova) IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Re-liquidação após edição - RED',
        true
      );
      
    ELSIF v_resultado_novo IN ('VOID', 'REEMBOLSO') THEN
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_VOID',
        v_bookmaker_novo_id, 'BOOKMAKER',
        v_stake_novo,
        COALESCE(v_bookmaker_novo_moeda, v_moeda_nova),
        CASE WHEN COALESCE(v_bookmaker_novo_moeda, v_moeda_nova) IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Re-liquidação após edição - VOID',
        true
      );
      
    ELSIF v_resultado_novo = 'MEIO_GREEN' THEN
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_GREEN',
        v_bookmaker_novo_id, 'BOOKMAKER',
        v_stake_novo + v_lucro_novo,
        COALESCE(v_bookmaker_novo_moeda, v_moeda_nova),
        CASE WHEN COALESCE(v_bookmaker_novo_moeda, v_moeda_nova) IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Re-liquidação após edição - MEIO_GREEN',
        true
      );
      
    ELSIF v_resultado_novo = 'MEIO_RED' THEN
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_RED',
        v_bookmaker_novo_id, 'BOOKMAKER',
        v_stake_novo / 2,
        COALESCE(v_bookmaker_novo_moeda, v_moeda_nova),
        CASE WHEN COALESCE(v_bookmaker_novo_moeda, v_moeda_nova) IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Re-liquidação após edição - MEIO_RED',
        true
      );
    END IF;
    
  END LOOP;
  
  -- ================================================================
  -- ETAPA 6: ATUALIZAR APOSTA PRINCIPAL
  -- ================================================================
  UPDATE apostas_unificada
  SET 
    bookmaker_id = COALESCE(p_novo_bookmaker_id, bookmaker_id),
    stake = COALESCE(p_novo_stake, stake),
    odd = COALESCE(p_nova_odd, odd),
    moeda_operacao = COALESCE(p_nova_moeda, moeda_operacao),
    resultado = COALESCE(p_novo_resultado, resultado),
    lucro_prejuizo = (
      SELECT SUM(lucro_prejuizo) 
      FROM apostas_pernas 
      WHERE aposta_id = p_aposta_id
    ),
    updated_at = NOW()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'reversao_aplicada', v_houve_mudanca_financeira,
    'reliquidacao_aplicada', v_houve_mudanca_financeira,
    'message', CASE 
      WHEN v_houve_mudanca_financeira THEN 'Aposta atualizada com reversão e re-liquidação financeira'
      ELSE 'Nenhuma mudança financeira detectada'
    END
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Comentário descritivo
COMMENT ON FUNCTION public.atualizar_aposta_liquidada_atomica IS 
'Atualiza apostas já liquidadas com reversão financeira automática. 
Detecta mudanças em bookmaker/stake/odd/resultado e:
1. Reverte o impacto financeiro anterior no bookmaker original
2. Aplica o novo impacto no bookmaker correto
Garante integridade financeira via cash_ledger (nunca UPDATE direto em saldos).';

-- Grant de execução
GRANT EXECUTE ON FUNCTION public.atualizar_aposta_liquidada_atomica TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_aposta_liquidada_atomica TO service_role;