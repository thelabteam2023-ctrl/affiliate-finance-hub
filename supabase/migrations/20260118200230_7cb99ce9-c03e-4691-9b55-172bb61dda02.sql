-- 1. Create RPC for re-liquidating bets (changing result of already liquidated bet)
-- This handles the reversal of previous result and application of new result

CREATE OR REPLACE FUNCTION public.reliquidar_aposta_atomica(
  p_aposta_id UUID,
  p_resultado_novo TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_resultado_anterior TEXT;
  v_lucro_anterior NUMERIC;
  v_lucro_novo NUMERIC;
  v_workspace_id UUID;
  v_user_id UUID;
  v_total_impacto NUMERIC := 0;
BEGIN
  -- Buscar aposta
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;
  
  -- Se não está liquidada, usar a função original
  IF v_aposta.status != 'LIQUIDADA' THEN
    RETURN liquidar_aposta_atomica(p_aposta_id, p_resultado_novo, p_lucro_prejuizo, NULL);
  END IF;
  
  -- Verificar se o resultado realmente mudou
  IF v_aposta.resultado = p_resultado_novo THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já aplicado');
  END IF;
  
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;

  -- Processar cada perna: reverter resultado anterior e aplicar novo
  FOR v_perna IN 
    SELECT ap.*, b.moeda as bookmaker_moeda
    FROM apostas_pernas ap
    JOIN bookmakers b ON b.id = ap.bookmaker_id
    WHERE ap.aposta_id = p_aposta_id
  LOOP
    v_resultado_anterior := v_perna.resultado;
    v_lucro_anterior := COALESCE(v_perna.lucro_prejuizo, 0);
    
    -- Calcular novo lucro/prejuízo da perna
    IF p_resultado_novo = 'GREEN' THEN
      v_lucro_novo := v_perna.stake * (v_perna.odd - 1);
    ELSIF p_resultado_novo = 'RED' THEN
      v_lucro_novo := -v_perna.stake;
    ELSIF p_resultado_novo IN ('VOID', 'REEMBOLSO') THEN
      v_lucro_novo := 0;
    ELSIF p_resultado_novo = 'MEIO_GREEN' THEN
      v_lucro_novo := v_perna.stake * (v_perna.odd - 1) / 2;
    ELSIF p_resultado_novo = 'MEIO_RED' THEN
      v_lucro_novo := -v_perna.stake / 2;
    ELSE
      v_lucro_novo := 0;
    END IF;
    
    -- Atualizar perna
    UPDATE apostas_pernas
    SET 
      resultado = p_resultado_novo,
      lucro_prejuizo = v_lucro_novo,
      updated_at = NOW()
    WHERE id = v_perna.id;
    
    -- ============================================================
    -- REVERTER RESULTADO ANTERIOR VIA LEDGER
    -- ============================================================
    IF v_resultado_anterior = 'GREEN' THEN
      -- Reverter GREEN: debitar o que foi creditado (stake + lucro)
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_REVERSAO',
        v_perna.bookmaker_id, 'BOOKMAKER',
        v_perna.stake + v_lucro_anterior,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Reversão de resultado GREEN anterior',
        true
      );
      
    ELSIF v_resultado_anterior = 'VOID' OR v_resultado_anterior = 'REEMBOLSO' THEN
      -- Reverter VOID: debitar o stake que foi devolvido
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_REVERSAO',
        v_perna.bookmaker_id, 'BOOKMAKER',
        v_perna.stake,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Reversão de resultado VOID anterior',
        true
      );
      
    ELSIF v_resultado_anterior = 'MEIO_GREEN' THEN
      -- Reverter MEIO_GREEN: debitar stake + meio lucro
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_REVERSAO',
        v_perna.bookmaker_id, 'BOOKMAKER',
        v_perna.stake + v_lucro_anterior,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Reversão de resultado MEIO_GREEN anterior',
        true
      );
      
    ELSIF v_resultado_anterior = 'MEIO_RED' THEN
      -- Reverter MEIO_RED: creditar metade do stake de volta (restaurar)
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_REVERSAO',
        v_perna.bookmaker_id, 'BOOKMAKER',
        v_perna.stake / 2,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Reversão de resultado MEIO_RED anterior (restaurar metade stake)',
        true
      );
    END IF;
    -- Note: RED não precisa reverter pois a stake já foi "perdida" no modelo de reserva
    
    -- ============================================================
    -- APLICAR NOVO RESULTADO VIA LEDGER
    -- ============================================================
    IF p_resultado_novo = 'GREEN' THEN
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_GREEN',
        v_perna.bookmaker_id, 'BOOKMAKER',
        v_perna.stake + v_lucro_novo,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta GREEN - Retorno: ' || (v_perna.stake + v_lucro_novo)::TEXT,
        true
      );
      
    ELSIF p_resultado_novo = 'RED' THEN
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_RED',
        v_perna.bookmaker_id, 'BOOKMAKER',
        v_perna.stake,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta RED - Stake perdido',
        true
      );
      
    ELSIF p_resultado_novo IN ('VOID', 'REEMBOLSO') THEN
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_VOID',
        v_perna.bookmaker_id, 'BOOKMAKER',
        v_perna.stake,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta VOID - Stake devolvido',
        true
      );
      
    ELSIF p_resultado_novo = 'MEIO_GREEN' THEN
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_MEIO_GREEN',
        v_perna.bookmaker_id, 'BOOKMAKER',
        v_perna.stake + v_lucro_novo,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta MEIO_GREEN - Retorno parcial',
        true
      );
      
    ELSIF p_resultado_novo = 'MEIO_RED' THEN
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo,
        valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional
      ) VALUES (
        v_workspace_id, v_user_id, 'APOSTA_MEIO_RED',
        v_perna.bookmaker_id, 'BOOKMAKER',
        v_perna.stake / 2,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta MEIO_RED - Meia perda',
        true
      );
    END IF;
    
    v_total_impacto := v_total_impacto + v_lucro_novo;
  END LOOP;

  -- Atualizar aposta principal
  UPDATE apostas_unificada
  SET 
    resultado = p_resultado_novo,
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, v_total_impacto),
    updated_at = NOW()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'resultado_anterior', v_aposta.resultado,
    'resultado_novo', p_resultado_novo,
    'impacto_total', v_total_impacto
  );
END;
$$;

-- 2. Update trigger to handle APOSTA_REVERSAO type
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_bookmaker_id UUID;
  v_delta NUMERIC;
  v_moeda TEXT;
  v_saldo_anterior NUMERIC;
  v_saldo_novo NUMERIC;
  v_usa_usd BOOLEAN;
BEGIN
  -- Only process on INSERT for cash_ledger entries
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- Determine bookmaker and delta based on transaction type
  CASE NEW.tipo_transacao
    -- Credits (destino_bookmaker_id)
    WHEN 'CASHBACK_MANUAL', 'PERDA_REVERSAO', 'AJUSTE_POSITIVO', 'EVENTO_PROMOCIONAL', 
         'APOSTA_GREEN', 'APOSTA_VOID', 'APOSTA_MEIO_GREEN', 'DEPOSITO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta := NEW.valor;
      
    -- Debits (origem_bookmaker_id)
    WHEN 'CASHBACK_ESTORNO', 'PERDA_OPERACIONAL', 'AJUSTE_NEGATIVO',
         'APOSTA_RED', 'APOSTA_MEIO_RED', 'SAQUE' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta := -NEW.valor;
    
    -- APOSTA_REVERSAO: can be credit or debit depending on which bookmaker is set
    WHEN 'APOSTA_REVERSAO' THEN
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.destino_bookmaker_id;
        v_delta := NEW.valor;
      ELSIF NEW.origem_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.origem_bookmaker_id;
        v_delta := -NEW.valor;
      ELSE
        RETURN NEW;
      END IF;
      
    ELSE
      -- Unknown type, skip
      RETURN NEW;
  END CASE;
  
  -- Skip if no bookmaker
  IF v_bookmaker_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get bookmaker currency and current balance
  SELECT moeda, 
         CASE WHEN moeda IN ('USD', 'USDT') THEN saldo_usd ELSE saldo_atual END
  INTO v_moeda, v_saldo_anterior
  FROM bookmakers
  WHERE id = v_bookmaker_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  
  v_usa_usd := v_moeda IN ('USD', 'USDT');
  v_saldo_novo := v_saldo_anterior + v_delta;
  
  -- Update the correct balance field
  IF v_usa_usd THEN
    UPDATE bookmakers
    SET saldo_usd = v_saldo_novo, updated_at = NOW()
    WHERE id = v_bookmaker_id;
  ELSE
    UPDATE bookmakers
    SET saldo_atual = v_saldo_novo, updated_at = NOW()
    WHERE id = v_bookmaker_id;
  END IF;
  
  -- Record audit trail
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id,
    workspace_id,
    saldo_anterior,
    saldo_novo,
    diferenca,
    origem,
    referencia_id,
    referencia_tipo,
    observacoes,
    user_id
  ) VALUES (
    v_bookmaker_id,
    NEW.workspace_id,
    v_saldo_anterior,
    v_saldo_novo,
    v_delta,
    'cash_ledger_trigger',
    NEW.id::TEXT,
    'cash_ledger',
    NEW.tipo_transacao || ': ' || COALESCE(NEW.descricao, ''),
    NEW.user_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Grant execute on new function
GRANT EXECUTE ON FUNCTION public.reliquidar_aposta_atomica(UUID, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reliquidar_aposta_atomica(UUID, TEXT, NUMERIC) TO service_role;