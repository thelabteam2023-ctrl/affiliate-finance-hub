
-- Corrigir a trigger para NÃO processar BONUS_CREDITADO e BONUS_ESTORNO
-- Esses tipos de transação afetam apenas a tabela project_bookmaker_link_bonuses (saldo_bonus)
-- Não devem impactar bookmakers.saldo_atual (saldo_real)

CREATE OR REPLACE FUNCTION atualizar_saldo_bookmaker_v2()
RETURNS TRIGGER AS $$
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

  -- CORREÇÃO: Ignorar transações de bônus - elas afetam apenas saldo_bonus via tabela de bônus
  -- O saldo_bonus é calculado pela RPC get_bookmaker_saldos via SUM(bonus_amount) dos bônus creditados
  IF NEW.tipo_transacao IN ('BONUS_CREDITADO', 'BONUS_ESTORNO') THEN
    -- Registrar apenas na auditoria sem alterar o saldo_atual
    IF NEW.destino_bookmaker_id IS NOT NULL THEN
      SELECT saldo_atual INTO v_saldo_anterior FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
      INSERT INTO bookmaker_balance_audit (
        bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
        origem, referencia_tipo, referencia_id, observacoes, user_id
      ) VALUES (
        NEW.destino_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_anterior,
        NEW.tipo_transacao, 'cash_ledger', NEW.id, NEW.descricao || ' (não impacta saldo real)', NEW.user_id
      );
    END IF;
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
    
    -- Registrar auditoria
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
    
    -- Registrar auditoria
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
$$ LANGUAGE plpgsql SET search_path = public;
