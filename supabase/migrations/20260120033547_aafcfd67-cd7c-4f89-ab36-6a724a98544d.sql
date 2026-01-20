-- Corrigir a função para NÃO inserir na coluna 'diferenca' (é gerada automaticamente)
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta NUMERIC;
  v_saldo_anterior NUMERIC;
  v_saldo_novo NUMERIC;
  v_moeda TEXT;
  v_bookmaker_id UUID;
BEGIN
  -- Ignorar se não há bookmaker envolvido
  IF NEW.destino_bookmaker_id IS NULL AND NEW.origem_bookmaker_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Processar crédito (destino) - aumenta saldo
  IF NEW.destino_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.destino_bookmaker_id;
    
    -- Buscar saldo anterior e moeda
    SELECT saldo_atual, moeda INTO v_saldo_anterior, v_moeda
    FROM bookmakers
    WHERE id = v_bookmaker_id;
    
    IF NOT FOUND THEN
      RAISE WARNING '[atualizar_saldo_bookmaker_v2] Bookmaker destino % não encontrado', v_bookmaker_id;
      RETURN NEW;
    END IF;
    
    v_delta := NEW.valor;
    v_saldo_novo := v_saldo_anterior + v_delta;
    
    -- Atualizar saldo
    UPDATE bookmakers
    SET saldo_atual = v_saldo_novo,
        updated_at = NOW()
    WHERE id = v_bookmaker_id;
    
    -- Registrar auditoria (diferenca é calculada automaticamente como coluna gerada)
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
      origem, referencia_tipo, referencia_id, observacoes, user_id
    ) VALUES (
      v_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_novo,
      NEW.tipo_transacao, 'cash_ledger', NEW.id, NEW.descricao, NEW.user_id
    );
  END IF;

  -- Processar débito (origem) - diminui saldo
  IF NEW.origem_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.origem_bookmaker_id;
    
    -- Buscar saldo anterior e moeda
    SELECT saldo_atual, moeda INTO v_saldo_anterior, v_moeda
    FROM bookmakers
    WHERE id = v_bookmaker_id;
    
    IF NOT FOUND THEN
      RAISE WARNING '[atualizar_saldo_bookmaker_v2] Bookmaker origem % não encontrado', v_bookmaker_id;
      RETURN NEW;
    END IF;
    
    v_delta := -NEW.valor;
    v_saldo_novo := v_saldo_anterior + v_delta;
    
    -- Atualizar saldo
    UPDATE bookmakers
    SET saldo_atual = v_saldo_novo,
        updated_at = NOW()
    WHERE id = v_bookmaker_id;
    
    -- Registrar auditoria (diferenca é calculada automaticamente como coluna gerada)
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
      origem, referencia_tipo, referencia_id, observacoes, user_id
    ) VALUES (
      v_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_novo,
      NEW.tipo_transacao, 'cash_ledger', NEW.id, NEW.descricao, NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$;