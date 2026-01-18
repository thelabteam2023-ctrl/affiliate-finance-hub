-- Atualizar trigger atualizar_saldo_bookmaker_v2 para suportar novos tipos de transação
-- Tipos adicionados: CASHBACK_MANUAL, CASHBACK_ESTORNO, PERDA_OPERACIONAL, PERDA_REVERSAO, AJUSTE_POSITIVO, AJUSTE_NEGATIVO

CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker_id UUID;
  v_delta NUMERIC;
  v_saldo_anterior NUMERIC;
  v_moeda TEXT;
  v_is_usd BOOLEAN;
BEGIN
  -- Tipos que creditam na bookmaker de destino
  IF NEW.tipo_transacao IN (
    'DEPOSITO', 
    'APOSTA_GREEN', 
    'APOSTA_MEIO_GREEN', 
    'APOSTA_VOID',
    'CASHBACK_MANUAL',
    'PERDA_REVERSAO',
    'AJUSTE_POSITIVO',
    'EVENTO_PROMOCIONAL'
  ) AND NEW.destino_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.destino_bookmaker_id;
    v_delta := NEW.valor;
    
  -- Tipos que debitam da bookmaker de origem
  ELSIF NEW.tipo_transacao IN (
    'SAQUE', 
    'APOSTA_RED', 
    'APOSTA_MEIO_RED',
    'CASHBACK_ESTORNO',
    'PERDA_OPERACIONAL',
    'AJUSTE_NEGATIVO'
  ) AND NEW.origem_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.origem_bookmaker_id;
    v_delta := -NEW.valor;
    
  -- Transferência entre bookmakers
  ELSIF NEW.tipo_transacao = 'TRANSFERENCIA' THEN
    -- Creditar destino
    IF NEW.destino_bookmaker_id IS NOT NULL THEN
      SELECT moeda, saldo_atual, saldo_usd 
      INTO v_moeda, v_saldo_anterior
      FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
      
      v_is_usd := v_moeda IN ('USD', 'USDT', 'USDC');
      
      -- Permitir atualização bypassing protect trigger
      PERFORM set_config('app.allow_balance_update', 'true', true);
      
      IF v_is_usd THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd + NEW.valor,
            saldo_atual = saldo_atual + NEW.valor,
            updated_at = NOW()
        WHERE id = NEW.destino_bookmaker_id;
      ELSE
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual + NEW.valor,
            updated_at = NOW()
        WHERE id = NEW.destino_bookmaker_id;
      END IF;
      
      -- Registrar auditoria
      INSERT INTO bookmaker_balance_audit (
        bookmaker_id, workspace_id, saldo_anterior, saldo_novo, 
        diferenca, origem, referencia_id, referencia_tipo, observacoes
      )
      SELECT 
        NEW.destino_bookmaker_id,
        NEW.workspace_id,
        v_saldo_anterior,
        v_saldo_anterior + NEW.valor,
        NEW.valor,
        'LEDGER_TRIGGER',
        NEW.id,
        'cash_ledger',
        'Transferência entrada: ' || COALESCE(NEW.descricao, '')
      FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
    END IF;
    
    -- Debitar origem
    IF NEW.origem_bookmaker_id IS NOT NULL THEN
      SELECT moeda, saldo_atual, saldo_usd 
      INTO v_moeda, v_saldo_anterior
      FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
      
      v_is_usd := v_moeda IN ('USD', 'USDT', 'USDC');
      
      IF v_is_usd THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd - NEW.valor,
            saldo_atual = saldo_atual - NEW.valor,
            updated_at = NOW()
        WHERE id = NEW.origem_bookmaker_id;
      ELSE
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual - NEW.valor,
            updated_at = NOW()
        WHERE id = NEW.origem_bookmaker_id;
      END IF;
      
      -- Registrar auditoria
      INSERT INTO bookmaker_balance_audit (
        bookmaker_id, workspace_id, saldo_anterior, saldo_novo, 
        diferenca, origem, referencia_id, referencia_tipo, observacoes
      )
      SELECT 
        NEW.origem_bookmaker_id,
        NEW.workspace_id,
        v_saldo_anterior,
        v_saldo_anterior - NEW.valor,
        -NEW.valor,
        'LEDGER_TRIGGER',
        NEW.id,
        'cash_ledger',
        'Transferência saída: ' || COALESCE(NEW.descricao, '')
      FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
    END IF;
    
    RETURN NEW;
  ELSE
    -- Tipo não tratado, retornar sem alterar
    RETURN NEW;
  END IF;
  
  -- Processamento padrão para tipos simples (não-transferência)
  IF v_bookmaker_id IS NOT NULL THEN
    SELECT moeda, CASE WHEN moeda IN ('USD', 'USDT', 'USDC') THEN saldo_usd ELSE saldo_atual END
    INTO v_moeda, v_saldo_anterior
    FROM bookmakers WHERE id = v_bookmaker_id;
    
    v_is_usd := v_moeda IN ('USD', 'USDT', 'USDC');
    
    -- Permitir atualização bypassing protect trigger
    PERFORM set_config('app.allow_balance_update', 'true', true);
    
    IF v_is_usd THEN
      UPDATE bookmakers 
      SET saldo_usd = saldo_usd + v_delta,
          saldo_atual = saldo_atual + v_delta,
          updated_at = NOW()
      WHERE id = v_bookmaker_id;
    ELSE
      UPDATE bookmakers 
      SET saldo_atual = saldo_atual + v_delta,
          updated_at = NOW()
      WHERE id = v_bookmaker_id;
    END IF;
    
    -- Registrar auditoria
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo, 
      diferenca, origem, referencia_id, referencia_tipo, observacoes
    )
    SELECT 
      v_bookmaker_id,
      NEW.workspace_id,
      v_saldo_anterior,
      v_saldo_anterior + v_delta,
      v_delta,
      'LEDGER_TRIGGER',
      NEW.id,
      'cash_ledger',
      NEW.tipo_transacao || ': ' || COALESCE(NEW.descricao, '')
    FROM bookmakers WHERE id = v_bookmaker_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Garantir que o trigger existe
DROP TRIGGER IF EXISTS trigger_atualizar_saldo_bookmaker_v2 ON cash_ledger;
CREATE TRIGGER trigger_atualizar_saldo_bookmaker_v2
  AFTER INSERT ON cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_saldo_bookmaker_v2();