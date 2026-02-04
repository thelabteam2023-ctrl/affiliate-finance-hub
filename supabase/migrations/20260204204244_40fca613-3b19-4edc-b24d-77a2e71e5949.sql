-- ============================================================================
-- CORREÇÃO CRÍTICA: atualizar_aposta_liquidada_atomica v2
-- 
-- PROBLEMA ANTERIOR:
-- A RPC inseria no cash_ledger com tipos (APOSTA_REVERSAO, APOSTA_GREEN, etc)
-- que NÃO são processados pelo trigger fn_cash_ledger_generate_financial_events.
-- Resultado: edições de apostas não atualizavam o saldo da bookmaker.
--
-- SOLUÇÃO:
-- Inserir diretamente em financial_events (fonte única de verdade v9.5)
-- usando os tipos padronizados: REVERSAL, PAYOUT, VOID_REFUND
-- ============================================================================

-- Dropar versão antiga (parâmetros mudaram)
DROP FUNCTION IF EXISTS public.atualizar_aposta_liquidada_atomica(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT);

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
  v_valor_reversao NUMERIC;
  v_valor_payout NUMERIC;
  v_fonte_saldo TEXT;
  v_tipo_uso TEXT;
  v_idempotency_prefix TEXT;
BEGIN
  -- Lock para evitar race conditions
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;

  -- Se não está liquidada, apenas atualizar campos (sem eventos financeiros)
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

    RETURN jsonb_build_object('success', true, 'message', 'Aposta não liquidada atualizada');
  END IF;

  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_resultado_atual := v_aposta.resultado;
  v_fonte_saldo := COALESCE(v_aposta.fonte_saldo, 'REAL');
  
  -- Determinar tipo_uso baseado na fonte_saldo
  v_tipo_uso := CASE 
    WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET'
    ELSE 'NORMAL'
  END;

  -- Valores anteriores
  v_bookmaker_anterior_id := v_aposta.bookmaker_id;
  v_stake_anterior := COALESCE(v_aposta.stake, 0);
  v_odd_anterior := COALESCE(v_aposta.odd, 1);
  v_moeda_anterior := COALESCE(v_aposta.moeda_operacao, 'BRL');
  v_lucro_anterior := COALESCE(v_aposta.lucro_prejuizo, 0);

  -- Valores novos (COALESCE com anteriores se não fornecido)
  v_bookmaker_novo_id := COALESCE(p_novo_bookmaker_id, v_bookmaker_anterior_id);
  v_stake_novo := COALESCE(p_novo_stake, v_stake_anterior);
  v_odd_novo := COALESCE(p_nova_odd, v_odd_anterior);
  v_moeda_nova := COALESCE(p_nova_moeda, v_moeda_anterior);
  v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);

  -- Verificar se houve mudança financeira
  IF v_bookmaker_novo_id != v_bookmaker_anterior_id
     OR v_stake_novo != v_stake_anterior
     OR v_odd_novo != v_odd_anterior
     OR v_resultado_novo != v_resultado_atual THEN
    v_houve_mudanca_financeira := true;
  END IF;

  -- Se não houve mudança financeira, apenas atualizar campos descritivos
  IF NOT v_houve_mudanca_financeira THEN
    UPDATE apostas_unificada
    SET 
      bookmaker_id = v_bookmaker_novo_id,
      stake = v_stake_novo,
      odd = v_odd_novo,
      moeda_operacao = v_moeda_nova,
      resultado = v_resultado_novo,
      updated_at = NOW()
    WHERE id = p_aposta_id;

    RETURN jsonb_build_object('success', true, 'message', 'Aposta atualizada sem mudança financeira');
  END IF;

  -- ==========================================================================
  -- PASSO 1: REVERTER RESULTADO ANTERIOR
  -- Inserir evento REVERSAL em financial_events para anular o payout anterior
  -- ==========================================================================
  v_idempotency_prefix := 'edit_rev_' || p_aposta_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;
  
  IF v_resultado_atual = 'GREEN' THEN
    -- GREEN anterior: payout foi stake + lucro → reverter total
    v_valor_reversao := v_stake_anterior + v_lucro_anterior;
    IF v_valor_reversao > 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
      ) VALUES (
        v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
        'REVERSAL', v_tipo_uso, 'AJUSTE',
        -v_valor_reversao, -- NEGATIVO (débito = reversão do crédito)
        v_moeda_anterior,
        v_idempotency_prefix || '_payout',
        'Reversão de GREEN por edição de aposta',
        jsonb_build_object('resultado_anterior', 'GREEN', 'payout_revertido', v_valor_reversao),
        NOW(), v_user_id
      );
    END IF;
  ELSIF v_resultado_atual = 'VOID' THEN
    -- VOID anterior: stake foi devolvido → reverter devolução
    v_valor_reversao := v_stake_anterior;
    IF v_valor_reversao > 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
      ) VALUES (
        v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
        'REVERSAL', v_tipo_uso, 'AJUSTE',
        -v_valor_reversao,
        v_moeda_anterior,
        v_idempotency_prefix || '_void',
        'Reversão de VOID por edição de aposta',
        jsonb_build_object('resultado_anterior', 'VOID', 'refund_revertido', v_valor_reversao),
        NOW(), v_user_id
      );
    END IF;
  ELSIF v_resultado_atual = 'MEIO_GREEN' THEN
    -- MEIO_GREEN: stake + metade do lucro
    v_valor_reversao := v_stake_anterior + (v_lucro_anterior);
    IF v_valor_reversao > 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
      ) VALUES (
        v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
        'REVERSAL', v_tipo_uso, 'AJUSTE',
        -v_valor_reversao,
        v_moeda_anterior,
        v_idempotency_prefix || '_meio_green',
        'Reversão de MEIO_GREEN por edição de aposta',
        jsonb_build_object('resultado_anterior', 'MEIO_GREEN', 'payout_revertido', v_valor_reversao),
        NOW(), v_user_id
      );
    END IF;
  ELSIF v_resultado_atual = 'MEIO_RED' THEN
    -- MEIO_RED: metade do stake foi devolvido
    v_valor_reversao := v_stake_anterior / 2;
    IF v_valor_reversao > 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
      ) VALUES (
        v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
        'REVERSAL', v_tipo_uso, 'AJUSTE',
        -v_valor_reversao,
        v_moeda_anterior,
        v_idempotency_prefix || '_meio_red',
        'Reversão de MEIO_RED por edição de aposta',
        jsonb_build_object('resultado_anterior', 'MEIO_RED', 'refund_revertido', v_valor_reversao),
        NOW(), v_user_id
      );
    END IF;
  END IF;
  -- RED anterior: payout era 0, não há nada para reverter

  -- ==========================================================================
  -- PASSO 2: APLICAR NOVO RESULTADO
  -- Inserir evento PAYOUT/VOID_REFUND para o novo resultado
  -- ==========================================================================
  v_idempotency_prefix := 'edit_new_' || p_aposta_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;
  
  IF v_resultado_novo = 'GREEN' THEN
    v_lucro_novo := v_stake_novo * (v_odd_novo - 1);
    v_valor_payout := v_stake_novo + v_lucro_novo;
    
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
      'PAYOUT', v_tipo_uso, 'LUCRO',
      v_valor_payout, -- POSITIVO (crédito)
      v_moeda_nova,
      v_idempotency_prefix || '_payout',
      'Payout GREEN (re-liquidação por edição)',
      jsonb_build_object('stake', v_stake_novo, 'odd', v_odd_novo, 'lucro', v_lucro_novo),
      NOW(), v_user_id
    );
    
  ELSIF v_resultado_novo = 'RED' THEN
    -- RED: payout = 0, não há crédito
    v_lucro_novo := -v_stake_novo;
    
  ELSIF v_resultado_novo = 'VOID' THEN
    v_lucro_novo := 0;
    v_valor_payout := v_stake_novo;
    
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
      'VOID_REFUND', v_tipo_uso, 'AJUSTE',
      v_valor_payout,
      v_moeda_nova,
      v_idempotency_prefix || '_void',
      'Devolução VOID (re-liquidação por edição)',
      jsonb_build_object('stake_devolvido', v_stake_novo),
      NOW(), v_user_id
    );
    
  ELSIF v_resultado_novo = 'MEIO_GREEN' THEN
    v_lucro_novo := (v_stake_novo * (v_odd_novo - 1)) / 2;
    v_valor_payout := v_stake_novo + v_lucro_novo;
    
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
      'PAYOUT', v_tipo_uso, 'LUCRO',
      v_valor_payout,
      v_moeda_nova,
      v_idempotency_prefix || '_payout',
      'Payout MEIO_GREEN (re-liquidação por edição)',
      jsonb_build_object('stake', v_stake_novo, 'odd', v_odd_novo, 'lucro', v_lucro_novo),
      NOW(), v_user_id
    );
    
  ELSIF v_resultado_novo = 'MEIO_RED' THEN
    v_lucro_novo := -(v_stake_novo / 2);
    v_valor_payout := v_stake_novo / 2;
    
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
      'VOID_REFUND', v_tipo_uso, 'AJUSTE',
      v_valor_payout,
      v_moeda_nova,
      v_idempotency_prefix || '_meio_red',
      'Devolução parcial MEIO_RED (re-liquidação por edição)',
      jsonb_build_object('stake_devolvido', v_valor_payout),
      NOW(), v_user_id
    );
  END IF;

  -- ==========================================================================
  -- PASSO 3: ATUALIZAR REGISTRO DA APOSTA
  -- ==========================================================================
  UPDATE apostas_unificada
  SET 
    bookmaker_id = v_bookmaker_novo_id,
    stake = v_stake_novo,
    odd = v_odd_novo,
    moeda_operacao = v_moeda_nova,
    resultado = v_resultado_novo,
    lucro_prejuizo = v_lucro_novo,
    updated_at = NOW()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Aposta re-liquidada via financial_events',
    'lucro_novo', v_lucro_novo,
    'valor_reversao', v_valor_reversao,
    'valor_payout', v_valor_payout
  );
END;
$$;

-- Comentário explicativo
COMMENT ON FUNCTION public.atualizar_aposta_liquidada_atomica IS 
'RPC v2: Atualiza aposta já liquidada com reversão/reaplicação financeira.
Usa financial_events (fonte única v9.5) ao invés de cash_ledger.
Corrige bug onde edições não atualizavam saldo da bookmaker.';