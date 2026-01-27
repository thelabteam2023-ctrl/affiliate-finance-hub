
-- ================================================================
-- FIX: atualizar_aposta_liquidada_atomica para funcionar com apostas simples
-- que não têm entradas em apostas_pernas
-- ================================================================

CREATE OR REPLACE FUNCTION public.atualizar_aposta_liquidada_atomica(
  p_aposta_id uuid, 
  p_novo_bookmaker_id uuid DEFAULT NULL::uuid, 
  p_novo_stake numeric DEFAULT NULL::numeric, 
  p_nova_odd numeric DEFAULT NULL::numeric, 
  p_novo_resultado text DEFAULT NULL::text, 
  p_nova_moeda text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_has_pernas BOOLEAN := false;
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
  -- VERIFICAR SE TEM PERNAS
  -- ================================================================
  SELECT EXISTS(
    SELECT 1 FROM apostas_pernas WHERE aposta_id = p_aposta_id
  ) INTO v_has_pernas;
  
  -- ================================================================
  -- ETAPA 2A: SE NÃO TEM PERNAS, USAR DADOS DA APOSTA DIRETAMENTE
  -- (FALLBACK PARA APOSTAS SIMPLES)
  -- ================================================================
  IF NOT v_has_pernas THEN
    -- Snapshot do estado anterior usando dados da aposta
    v_bookmaker_anterior_id := v_aposta.bookmaker_id;
    v_stake_anterior := v_aposta.stake;
    v_odd_anterior := v_aposta.odd;
    v_moeda_anterior := COALESCE(v_aposta.moeda_operacao, 'BRL');
    v_lucro_anterior := COALESCE(v_aposta.lucro_prejuizo, 0);
    
    -- Determinar novos valores
    v_bookmaker_novo_id := COALESCE(p_novo_bookmaker_id, v_bookmaker_anterior_id);
    v_stake_novo := COALESCE(p_novo_stake, v_stake_anterior);
    v_odd_novo := COALESCE(p_nova_odd, v_odd_anterior);
    v_moeda_nova := COALESCE(p_nova_moeda, v_moeda_anterior);
    v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);
    
    -- Verificar se houve mudança financeiramente relevante
    IF v_bookmaker_novo_id != v_bookmaker_anterior_id 
       OR v_stake_novo != v_stake_anterior 
       OR v_odd_novo != v_odd_anterior
       OR v_resultado_novo != v_resultado_atual THEN
      v_houve_mudanca_financeira := true;
    END IF;
    
    IF v_houve_mudanca_financeira THEN
      -- ================================================================
      -- REVERTER IMPACTO ANTERIOR
      -- ================================================================
      IF v_resultado_atual = 'GREEN' THEN
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
          'Reversão por edição de aposta simples - resultado anterior: ' || v_resultado_atual,
          true
        );
        
      ELSIF v_resultado_atual = 'RED' THEN
        -- RED já confirmou perda do stake, devolver ao bookmaker
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
          'Reversão RED por edição de aposta simples - Stake devolvido',
          true
        );
        
      ELSIF v_resultado_atual IN ('VOID', 'REEMBOLSO') THEN
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
          'Reversão VOID por edição de aposta simples',
          true
        );
        
      ELSIF v_resultado_atual = 'MEIO_GREEN' THEN
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
          'Reversão MEIO_GREEN por edição de aposta simples',
          true
        );
        
      ELSIF v_resultado_atual = 'MEIO_RED' THEN
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
          'Reversão MEIO_RED por edição de aposta simples',
          true
        );
      END IF;
      
      -- ================================================================
      -- CALCULAR NOVO LUCRO
      -- ================================================================
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
      
      -- ================================================================
      -- APLICAR NOVA LIQUIDAÇÃO
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
      
      -- Atualizar aposta principal
      UPDATE apostas_unificada
      SET 
        bookmaker_id = v_bookmaker_novo_id,
        stake = v_stake_novo,
        odd = v_odd_novo,
        moeda_operacao = COALESCE(v_bookmaker_novo_moeda, v_moeda_nova),
        resultado = v_resultado_novo,
        lucro_prejuizo = v_lucro_novo,
        updated_at = NOW()
      WHERE id = p_aposta_id;
      
    END IF; -- v_houve_mudanca_financeira
    
    RETURN jsonb_build_object(
      'success', true,
      'reversao_aplicada', v_houve_mudanca_financeira,
      'reliquidacao_aplicada', v_houve_mudanca_financeira,
      'fallback_aposta_simples', true,
      'message', CASE 
        WHEN v_houve_mudanca_financeira THEN 'Aposta simples atualizada com reversão e re-liquidação financeira'
        ELSE 'Nenhuma mudança financeira detectada'
      END
    );
  END IF; -- NOT v_has_pernas
  
  -- ================================================================
  -- ETAPA 2B: PROCESSAR VIA PERNAS (código original)
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
    IF v_perna.ordem = 1 THEN
      v_bookmaker_novo_id := COALESCE(p_novo_bookmaker_id, v_bookmaker_anterior_id);
      v_stake_novo := COALESCE(p_novo_stake, v_stake_anterior);
      v_odd_novo := COALESCE(p_nova_odd, v_odd_anterior);
      v_moeda_nova := COALESCE(p_nova_moeda, v_moeda_anterior);
      v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);
    ELSE
      v_bookmaker_novo_id := v_bookmaker_anterior_id;
      v_stake_novo := v_stake_anterior;
      v_odd_novo := v_odd_anterior;
      v_moeda_nova := v_moeda_anterior;
      v_resultado_novo := COALESCE(p_novo_resultado, v_perna.resultado);
    END IF;
    
    -- Verificar se houve mudança
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
    
    -- REVERTER IMPACTO ANTERIOR
    IF v_perna.resultado = 'GREEN' THEN
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
    
    -- APLICAR NOVA LIQUIDAÇÃO
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
    'fallback_aposta_simples', false,
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
$function$;
