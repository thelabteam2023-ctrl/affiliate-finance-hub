
-- Dropar função existente e recriar com fix
DROP FUNCTION IF EXISTS atualizar_aposta_liquidada_atomica(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION atualizar_aposta_liquidada_atomica(
  p_aposta_id UUID,
  p_novo_bookmaker_id UUID DEFAULT NULL,
  p_novo_stake NUMERIC DEFAULT NULL,
  p_nova_odd NUMERIC DEFAULT NULL,
  p_nova_moeda TEXT DEFAULT NULL,
  p_novo_resultado TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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
  v_has_pernas BOOLEAN := false;
  v_valor_reversao NUMERIC;
  v_valor_payout NUMERIC;
BEGIN
  -- ================================================================
  -- ETAPA 1: LOCK E VALIDAÇÃO
  -- ================================================================
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;
  
  -- Se não está liquidada, apenas atualizar normalmente
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
    
    RETURN jsonb_build_object('success', true, 'message', 'Aposta não liquidada atualizada');
  END IF;
  
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_resultado_atual := v_aposta.resultado;
  
  -- Verificar se tem pernas
  SELECT EXISTS(SELECT 1 FROM apostas_pernas WHERE aposta_id = p_aposta_id) INTO v_has_pernas;
  
  -- ================================================================
  -- ETAPA 2A: APOSTAS SIMPLES (SEM PERNAS)
  -- ================================================================
  IF NOT v_has_pernas THEN
    v_bookmaker_anterior_id := v_aposta.bookmaker_id;
    v_stake_anterior := COALESCE(v_aposta.stake, 0);
    v_odd_anterior := COALESCE(v_aposta.odd, 1);
    v_moeda_anterior := COALESCE(v_aposta.moeda_operacao, 'BRL');
    v_lucro_anterior := COALESCE(v_aposta.lucro_prejuizo, 0);
    
    v_bookmaker_novo_id := COALESCE(p_novo_bookmaker_id, v_bookmaker_anterior_id);
    v_stake_novo := COALESCE(p_novo_stake, v_stake_anterior);
    v_odd_novo := COALESCE(p_nova_odd, v_odd_anterior);
    v_moeda_nova := COALESCE(p_nova_moeda, v_moeda_anterior);
    v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);
    
    IF v_bookmaker_novo_id != v_bookmaker_anterior_id 
       OR v_stake_novo != v_stake_anterior 
       OR v_odd_novo != v_odd_anterior
       OR v_resultado_novo != v_resultado_atual THEN
      v_houve_mudanca_financeira := true;
    END IF;
    
    IF v_houve_mudanca_financeira THEN
      -- REVERTER resultado anterior
      IF v_resultado_atual = 'GREEN' THEN
        v_valor_reversao := v_stake_anterior + v_lucro_anterior;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão GREEN por edição', false);
      ELSIF v_resultado_atual = 'RED' THEN
        v_valor_reversao := v_stake_anterior;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão RED - Stake devolvido', false);
      ELSIF v_resultado_atual = 'VOID' THEN
        v_valor_reversao := v_stake_anterior;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão VOID', false);
      ELSIF v_resultado_atual = 'MEIO_GREEN' THEN
        v_valor_reversao := v_stake_anterior + (v_lucro_anterior / 2);
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão MEIO_GREEN', false);
      ELSIF v_resultado_atual = 'MEIO_RED' THEN
        v_valor_reversao := v_stake_anterior / 2;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão MEIO_RED', false);
      END IF;
      
      -- APLICAR novo resultado
      IF v_resultado_novo = 'GREEN' THEN
        v_lucro_novo := v_stake_novo * (v_odd_novo - 1);
        v_valor_payout := v_stake_novo + v_lucro_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_GREEN', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - GREEN', true);
      ELSIF v_resultado_novo = 'RED' THEN
        v_lucro_novo := -v_stake_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_RED', v_bookmaker_novo_id, 'BOOKMAKER', v_stake_novo, v_stake_novo, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - RED', true);
      ELSIF v_resultado_novo = 'VOID' THEN
        v_lucro_novo := 0;
        v_valor_payout := v_stake_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_VOID', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - VOID', false);
      ELSIF v_resultado_novo = 'MEIO_GREEN' THEN
        v_lucro_novo := (v_stake_novo * (v_odd_novo - 1)) / 2;
        v_valor_payout := v_stake_novo + v_lucro_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_GREEN', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - MEIO_GREEN', true);
      ELSIF v_resultado_novo = 'MEIO_RED' THEN
        v_lucro_novo := -(v_stake_novo / 2);
        v_valor_payout := v_stake_novo / 2;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_RED', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - MEIO_RED', true);
      END IF;
      
      UPDATE apostas_unificada
      SET bookmaker_id = v_bookmaker_novo_id, stake = v_stake_novo, odd = v_odd_novo, moeda_operacao = v_moeda_nova, resultado = v_resultado_novo, lucro_prejuizo = v_lucro_novo, updated_at = NOW()
      WHERE id = p_aposta_id;
      
      RETURN jsonb_build_object('success', true, 'message', 'Aposta simples re-liquidada', 'lucro_novo', v_lucro_novo, 'reversao_aplicada', true);
    END IF;
    
    UPDATE apostas_unificada
    SET bookmaker_id = v_bookmaker_novo_id, stake = v_stake_novo, odd = v_odd_novo, moeda_operacao = v_moeda_nova, resultado = v_resultado_novo, updated_at = NOW()
    WHERE id = p_aposta_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Aposta simples atualizada');
  END IF;
  
  -- ================================================================
  -- ETAPA 2B: COM PERNAS (SUREBETS/MÚLTIPLAS)
  -- ================================================================
  FOR v_perna IN SELECT * FROM apostas_pernas WHERE aposta_id = p_aposta_id LOOP
    v_bookmaker_anterior_id := v_perna.bookmaker_id;
    v_stake_anterior := COALESCE(v_perna.stake, 0);
    v_odd_anterior := COALESCE(v_perna.odd, 1);
    v_moeda_anterior := COALESCE(v_perna.moeda, 'BRL');
    v_lucro_anterior := COALESCE(v_perna.lucro_prejuizo, 0);
    
    v_bookmaker_novo_id := COALESCE(p_novo_bookmaker_id, v_bookmaker_anterior_id);
    v_stake_novo := COALESCE(p_novo_stake, v_stake_anterior);
    v_odd_novo := COALESCE(p_nova_odd, v_odd_anterior);
    v_moeda_nova := COALESCE(p_nova_moeda, v_moeda_anterior);
    v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);
    
    IF v_bookmaker_novo_id != v_bookmaker_anterior_id 
       OR v_stake_novo != v_stake_anterior 
       OR v_odd_novo != v_odd_anterior
       OR v_resultado_novo != v_resultado_atual THEN
      v_houve_mudanca_financeira := true;
    END IF;
    
    IF v_houve_mudanca_financeira THEN
      -- REVERTER resultado anterior
      IF v_resultado_atual = 'GREEN' THEN
        v_valor_reversao := v_stake_anterior + v_lucro_anterior;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão GREEN', false);
      ELSIF v_resultado_atual = 'RED' THEN
        v_valor_reversao := v_stake_anterior;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão RED - Stake devolvido', false);
      ELSIF v_resultado_atual = 'VOID' THEN
        v_valor_reversao := v_stake_anterior;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão VOID', false);
      ELSIF v_resultado_atual = 'MEIO_GREEN' THEN
        v_valor_reversao := v_stake_anterior + (v_lucro_anterior / 2);
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão MEIO_GREEN', false);
      ELSIF v_resultado_atual = 'MEIO_RED' THEN
        v_valor_reversao := v_stake_anterior / 2;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão MEIO_RED', false);
      END IF;
      
      -- APLICAR novo resultado
      IF v_resultado_novo = 'GREEN' THEN
        v_lucro_novo := v_stake_novo * (v_odd_novo - 1);
        v_valor_payout := v_stake_novo + v_lucro_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_GREEN', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - GREEN', true);
      ELSIF v_resultado_novo = 'RED' THEN
        v_lucro_novo := -v_stake_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_RED', v_bookmaker_novo_id, 'BOOKMAKER', v_stake_novo, v_stake_novo, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - RED', true);
      ELSIF v_resultado_novo = 'VOID' THEN
        v_lucro_novo := 0;
        v_valor_payout := v_stake_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_VOID', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - VOID', false);
      ELSIF v_resultado_novo = 'MEIO_GREEN' THEN
        v_lucro_novo := (v_stake_novo * (v_odd_novo - 1)) / 2;
        v_valor_payout := v_stake_novo + v_lucro_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_GREEN', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - MEIO_GREEN', true);
      ELSIF v_resultado_novo = 'MEIO_RED' THEN
        v_lucro_novo := -(v_stake_novo / 2);
        v_valor_payout := v_stake_novo / 2;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_RED', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - MEIO_RED', true);
      END IF;
      
      UPDATE apostas_pernas
      SET bookmaker_id = v_bookmaker_novo_id, stake = v_stake_novo, odd = v_odd_novo, moeda = v_moeda_nova, resultado = v_resultado_novo, lucro_prejuizo = v_lucro_novo, updated_at = NOW()
      WHERE id = v_perna.id;
    END IF;
  END LOOP;
  
  IF v_houve_mudanca_financeira THEN
    UPDATE apostas_unificada
    SET bookmaker_id = v_bookmaker_novo_id, stake = v_stake_novo, odd = v_odd_novo, moeda_operacao = v_moeda_nova, resultado = v_resultado_novo, lucro_prejuizo = v_lucro_novo, updated_at = NOW()
    WHERE id = p_aposta_id;
  ELSE
    UPDATE apostas_unificada
    SET bookmaker_id = COALESCE(p_novo_bookmaker_id, bookmaker_id), stake = COALESCE(p_novo_stake, stake), odd = COALESCE(p_nova_odd, odd), moeda_operacao = COALESCE(p_nova_moeda, moeda_operacao), resultado = COALESCE(p_novo_resultado, resultado), updated_at = NOW()
    WHERE id = p_aposta_id;
  END IF;
  
  RETURN jsonb_build_object('success', true, 'message', CASE WHEN v_houve_mudanca_financeira THEN 'Aposta re-liquidada' ELSE 'Aposta atualizada' END, 'reversao_aplicada', v_houve_mudanca_financeira);
END;
$$;
