-- =====================================================
-- CORREÇÃO: Adicionar APOSTA_REVERSAO ao trigger de saldo
-- =====================================================
-- O tipo APOSTA_REVERSAO não estava sendo reconhecido pelo trigger,
-- causando reversões de apostas a não impactarem o saldo.

CREATE OR REPLACE FUNCTION atualizar_saldo_bookmaker_v3()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker_id UUID;
  v_valor NUMERIC;
  v_operacao TEXT;
  v_saldo_anterior NUMERIC;
  v_saldo_novo NUMERIC;
BEGIN
  -- REGRA 1: Não processar se status = PENDENTE
  IF NEW.status IN ('PENDENTE', 'pendente') THEN
    RETURN NEW;
  END IF;
  
  -- REGRA 2: Não reprocessar transações já processadas (proteção contra bug de duplo processamento)
  IF NEW.balance_processed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- REGRA 3: Para UPDATE, só processar mudança de PENDENTE para CONFIRMADO
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('PENDENTE', 'pendente') AND NEW.status IN ('CONFIRMADO', 'confirmado') THEN
      NULL; -- Continua processamento
    ELSE
      RETURN NEW; -- Ignora outros updates
    END IF;
  END IF;

  -- Determinar bookmaker e operação baseado no tipo de transação
  CASE NEW.tipo_transacao
    -- CRÉDITOS (destino_bookmaker_id recebe dinheiro)
    WHEN 'DEPOSITO', 'BONUS_CREDITADO', 'CASHBACK_MANUAL', 'GANHO_CAMBIAL', 
         'APOSTA_GREEN', 'APOSTA_MEIO_GREEN', 'APOSTA_VOID', 'PERDA_REVERSAO', 'GIRO_GRATIS' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_valor := COALESCE(NEW.valor_destino, NEW.valor);
      v_operacao := 'CREDITO';
    
    -- DÉBITOS (origem_bookmaker_id perde dinheiro)
    -- ADICIONADO: APOSTA_REVERSAO para reverter apostas excluídas
    WHEN 'SAQUE', 'APOSTA_RED', 'APOSTA_MEIO_RED', 'PERDA_CAMBIAL', 'BONUS_ESTORNO', 
         'CASHBACK_ESTORNO', 'PERDA_OPERACIONAL', 'GIRO_GRATIS_ESTORNO', 'APOSTA_REVERSAO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_valor := COALESCE(NEW.valor_origem, NEW.valor);
      v_operacao := 'DEBITO';
    
    WHEN 'AJUSTE_SALDO', 'AJUSTE_MANUAL' THEN
      IF NEW.ajuste_direcao = 'ENTRADA' THEN
        v_bookmaker_id := NEW.destino_bookmaker_id;
        v_valor := COALESCE(NEW.valor_destino, NEW.valor);
        v_operacao := 'CREDITO';
      ELSE
        v_bookmaker_id := NEW.origem_bookmaker_id;
        v_valor := COALESCE(NEW.valor_origem, NEW.valor);
        v_operacao := 'DEBITO';
      END IF;
    
    WHEN 'TRANSFERENCIA' THEN
      -- Transferência: debitar origem, creditar destino
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        SELECT saldo_atual INTO v_saldo_anterior FROM bookmakers WHERE id = NEW.origem_bookmaker_id FOR UPDATE;
        v_saldo_anterior := COALESCE(v_saldo_anterior, 0);
        v_saldo_novo := v_saldo_anterior - COALESCE(NEW.valor_origem, NEW.valor);
        
        UPDATE bookmakers SET saldo_atual = v_saldo_novo, updated_at = NOW() WHERE id = NEW.origem_bookmaker_id;
        
        INSERT INTO bookmaker_balance_audit (bookmaker_id, workspace_id, saldo_anterior, saldo_novo, origem, referencia_tipo, referencia_id, user_id)
        VALUES (NEW.origem_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_novo, 'LEDGER_TRIGGER_V3', NEW.tipo_transacao, NEW.id, NEW.user_id);
      END IF;
      
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        SELECT saldo_atual INTO v_saldo_anterior FROM bookmakers WHERE id = NEW.destino_bookmaker_id FOR UPDATE;
        v_saldo_anterior := COALESCE(v_saldo_anterior, 0);
        v_saldo_novo := v_saldo_anterior + COALESCE(NEW.valor_destino, NEW.valor);
        
        UPDATE bookmakers SET saldo_atual = v_saldo_novo, updated_at = NOW() WHERE id = NEW.destino_bookmaker_id;
        
        INSERT INTO bookmaker_balance_audit (bookmaker_id, workspace_id, saldo_anterior, saldo_novo, origem, referencia_tipo, referencia_id, user_id)
        VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_novo, 'LEDGER_TRIGGER_V3', NEW.tipo_transacao, NEW.id, NEW.user_id);
      END IF;
      
      -- Marcar como processado
      NEW.balance_processed_at := NOW();
      RETURN NEW;
    
    ELSE
      RETURN NEW;
  END CASE;

  IF v_bookmaker_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obter saldo atual com lock
  SELECT saldo_atual INTO v_saldo_anterior
  FROM bookmakers WHERE id = v_bookmaker_id FOR UPDATE;
  v_saldo_anterior := COALESCE(v_saldo_anterior, 0);

  -- Calcular novo saldo
  IF v_operacao = 'CREDITO' THEN
    v_saldo_novo := v_saldo_anterior + v_valor;
  ELSE
    v_saldo_novo := v_saldo_anterior - v_valor;
  END IF;

  -- Atualizar saldo
  UPDATE bookmakers SET saldo_atual = v_saldo_novo, updated_at = NOW() WHERE id = v_bookmaker_id;

  -- Registrar auditoria
  INSERT INTO bookmaker_balance_audit (bookmaker_id, workspace_id, saldo_anterior, saldo_novo, origem, referencia_tipo, referencia_id, user_id)
  VALUES (v_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_novo, 'LEDGER_TRIGGER_V3', NEW.tipo_transacao, NEW.id, NEW.user_id);

  -- CRÍTICO: Marcar transação como processada
  NEW.balance_processed_at := NOW();
  
  RETURN NEW;
END;
$$;

-- Atualizar também a função recalcular_saldo_bookmaker_v2 para incluir APOSTA_REVERSAO
CREATE OR REPLACE FUNCTION recalcular_saldo_bookmaker_v2(p_bookmaker_id UUID)
RETURNS TABLE(saldo_real_calculado NUMERIC, saldo_freebet_calculado NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_real NUMERIC := 0;
  v_saldo_freebet NUMERIC := 0;
  v_saldo_anterior_real NUMERIC;
  v_saldo_anterior_freebet NUMERIC;
  v_workspace_id UUID;
BEGIN
  -- Obter saldos anteriores
  SELECT b.saldo_atual, b.saldo_freebet, b.workspace_id 
  INTO v_saldo_anterior_real, v_saldo_anterior_freebet, v_workspace_id
  FROM bookmakers b WHERE b.id = p_bookmaker_id;

  -- ========== CALCULAR SALDO REAL ==========
  SELECT COALESCE(SUM(
    CASE 
      -- Créditos reais
      WHEN cl.destino_bookmaker_id = p_bookmaker_id AND cl.tipo_transacao IN (
        'DEPOSITO', 'CASHBACK_MANUAL', 'GANHO_CAMBIAL', 'APOSTA_GREEN', 'APOSTA_MEIO_GREEN',
        'APOSTA_VOID', 'PERDA_REVERSAO', 'GIRO_GRATIS', 'FREEBET_CONVERTIDA'
      ) THEN COALESCE(cl.valor_destino, cl.valor)
      
      -- Créditos via ajuste
      WHEN cl.destino_bookmaker_id = p_bookmaker_id AND cl.tipo_transacao IN ('AJUSTE_SALDO', 'AJUSTE_MANUAL') 
           AND cl.ajuste_direcao = 'ENTRADA' THEN COALESCE(cl.valor_destino, cl.valor)
      
      -- Débitos reais (ADICIONADO: APOSTA_REVERSAO)
      WHEN cl.origem_bookmaker_id = p_bookmaker_id AND cl.tipo_transacao IN (
        'SAQUE', 'APOSTA_RED', 'APOSTA_MEIO_RED', 'PERDA_CAMBIAL', 'CASHBACK_ESTORNO', 
        'PERDA_OPERACIONAL', 'GIRO_GRATIS_ESTORNO', 'APOSTA_REVERSAO'
      ) THEN -COALESCE(cl.valor_origem, cl.valor)
      
      -- Débitos via ajuste
      WHEN cl.origem_bookmaker_id = p_bookmaker_id AND cl.tipo_transacao IN ('AJUSTE_SALDO', 'AJUSTE_MANUAL') 
           AND cl.ajuste_direcao = 'SAIDA' THEN -COALESCE(cl.valor_origem, cl.valor)
      
      -- Transferências
      WHEN cl.destino_bookmaker_id = p_bookmaker_id AND cl.tipo_transacao = 'TRANSFERENCIA' 
           THEN COALESCE(cl.valor_destino, cl.valor)
      WHEN cl.origem_bookmaker_id = p_bookmaker_id AND cl.tipo_transacao = 'TRANSFERENCIA' 
           THEN -COALESCE(cl.valor_origem, cl.valor)
      
      ELSE 0
    END
  ), 0)
  INTO v_saldo_real
  FROM cash_ledger cl
  WHERE cl.status = 'CONFIRMADO'
    AND (cl.destino_bookmaker_id = p_bookmaker_id OR cl.origem_bookmaker_id = p_bookmaker_id);

  -- ========== CALCULAR SALDO FREEBET ==========
  SELECT COALESCE(SUM(
    CASE 
      -- Créditos freebet
      WHEN cl.destino_bookmaker_id = p_bookmaker_id AND cl.tipo_transacao IN ('FREEBET_CREDITADA', 'FREEBET_ESTORNO') 
           THEN COALESCE(cl.valor_destino, cl.valor)
      
      -- Débitos freebet
      WHEN cl.origem_bookmaker_id = p_bookmaker_id AND cl.tipo_transacao IN ('FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA') 
           THEN -COALESCE(cl.valor_origem, cl.valor)
      
      -- Conversão: debita freebet
      WHEN cl.destino_bookmaker_id = p_bookmaker_id AND cl.tipo_transacao = 'FREEBET_CONVERTIDA' 
           THEN -COALESCE(cl.valor_destino, cl.valor)
      
      ELSE 0
    END
  ), 0)
  INTO v_saldo_freebet
  FROM cash_ledger cl
  WHERE cl.status = 'CONFIRMADO'
    AND (cl.destino_bookmaker_id = p_bookmaker_id OR cl.origem_bookmaker_id = p_bookmaker_id);

  -- Garantir que freebet não fique negativo
  v_saldo_freebet := GREATEST(0, v_saldo_freebet);

  -- Atualizar bookmaker com ambos os saldos
  UPDATE bookmakers 
  SET saldo_atual = v_saldo_real, 
      saldo_freebet = v_saldo_freebet,
      updated_at = NOW()
  WHERE id = p_bookmaker_id;

  -- Registrar auditoria
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
    origem, referencia_tipo, observacoes
  ) VALUES (
    p_bookmaker_id, v_workspace_id,
    COALESCE(v_saldo_anterior_real, 0), v_saldo_real,
    'RECALCULO_V2', 'FREEBET_MIGRATION',
    format('Recálculo completo: real %s→%s, freebet %s→%s',
      v_saldo_anterior_real, v_saldo_real, v_saldo_anterior_freebet, v_saldo_freebet)
  );

  RETURN QUERY SELECT v_saldo_real, v_saldo_freebet;
END;
$$;