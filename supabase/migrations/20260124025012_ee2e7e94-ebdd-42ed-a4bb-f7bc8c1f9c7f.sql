-- ============================================================
-- MIGRAÇÃO: Freebet → Ledger Financeiro
-- Data: 2026-01-24
-- Objetivo: Fazer todo movimento de freebet passar pelo cash_ledger
-- ============================================================

-- 1️⃣ EXPANDIR O CONSTRAINT DO CASH_LEDGER
-- Adicionar novos tipos: FREEBET_CREDITADA, FREEBET_CONSUMIDA, FREEBET_EXPIRADA, FREEBET_CONVERTIDA

ALTER TABLE cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_tipo_transacao_check;

ALTER TABLE cash_ledger ADD CONSTRAINT cash_ledger_tipo_transacao_check CHECK (
  tipo_transacao = ANY (ARRAY[
    -- Tipos existentes
    'AJUSTE_SALDO'::text, 'AJUSTE_MANUAL'::text, 'AJUSTE_POSITIVO'::text, 'AJUSTE_NEGATIVO'::text,
    'CASHBACK_MANUAL'::text, 'CASHBACK_ESTORNO'::text,
    'APOSTA_GREEN'::text, 'APOSTA_RED'::text, 'APOSTA_VOID'::text, 
    'APOSTA_MEIO_GREEN'::text, 'APOSTA_MEIO_RED'::text, 'APOSTA_REVERSAO'::text,
    'BONUS_CREDITADO'::text, 'BONUS_ESTORNO'::text,
    'GIRO_GRATIS'::text, 'GIRO_GRATIS_ESTORNO'::text,
    'DEPOSITO'::text, 'SAQUE'::text, 'TRANSFERENCIA'::text,
    'APORTE_FINANCEIRO'::text, 'PERDA_OPERACIONAL'::text, 'PERDA_REVERSAO'::text,
    'CONCILIACAO'::text, 'ESTORNO'::text, 'EVENTO_PROMOCIONAL'::text,
    'GANHO_CAMBIAL'::text, 'PERDA_CAMBIAL'::text,
    'PAGTO_PARCEIRO'::text, 'PAGTO_FORNECEDOR'::text, 'PAGTO_OPERADOR'::text,
    'COMISSAO_INDICADOR'::text, 'BONUS_INDICADOR'::text, 'DESPESA_ADMINISTRATIVA'::text,
    'APORTE_INVESTIDOR'::text, 'RETIRADA_INVESTIDOR'::text,
    -- NOVOS TIPOS FREEBET
    'FREEBET_CREDITADA'::text,    -- Freebet recebida/liberada
    'FREEBET_CONSUMIDA'::text,    -- Freebet usada em aposta
    'FREEBET_EXPIRADA'::text,     -- Freebet expirou sem uso
    'FREEBET_CONVERTIDA'::text,   -- Freebet convertida em saldo real (extração)
    'FREEBET_ESTORNO'::text       -- Reversão de freebet (ex: edição de aposta)
  ])
);

-- 2️⃣ CRIAR/ATUALIZAR TRIGGER PARA PROCESSAR FREEBET
-- Versão 4 do trigger com suporte a saldo_freebet

CREATE OR REPLACE FUNCTION atualizar_saldo_bookmaker_v4()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker_id UUID;
  v_valor NUMERIC;
  v_saldo_anterior_real NUMERIC;
  v_saldo_anterior_freebet NUMERIC;
  v_saldo_novo_real NUMERIC;
  v_saldo_novo_freebet NUMERIC;
  v_operacao TEXT;
  v_afeta_saldo_real BOOLEAN := FALSE;
  v_afeta_saldo_freebet BOOLEAN := FALSE;
BEGIN
  -- REGRA 1: Não processar se status = PENDENTE
  IF NEW.status IN ('PENDENTE', 'pendente') THEN
    RETURN NEW;
  END IF;
  
  -- REGRA 2: Não reprocessar transações já processadas (idempotência)
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

  -- ======================================================
  -- CLASSIFICAÇÃO DO TIPO DE TRANSAÇÃO
  -- ======================================================
  
  CASE NEW.tipo_transacao
    -- TIPOS QUE AFETAM SALDO REAL (crédito)
    WHEN 'DEPOSITO', 'CASHBACK_MANUAL', 'GANHO_CAMBIAL', 'APOSTA_GREEN', 'APOSTA_MEIO_GREEN', 'APOSTA_VOID', 'PERDA_REVERSAO', 'GIRO_GRATIS' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_valor := COALESCE(NEW.valor_destino, NEW.valor);
      v_operacao := 'CREDITO';
      v_afeta_saldo_real := TRUE;
    
    -- TIPOS QUE AFETAM SALDO REAL (débito)
    WHEN 'SAQUE', 'APOSTA_RED', 'APOSTA_MEIO_RED', 'PERDA_CAMBIAL', 'CASHBACK_ESTORNO', 'PERDA_OPERACIONAL', 'GIRO_GRATIS_ESTORNO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_valor := COALESCE(NEW.valor_origem, NEW.valor);
      v_operacao := 'DEBITO';
      v_afeta_saldo_real := TRUE;
    
    -- TIPOS DE BÔNUS (não afetam saldo real no trigger, apenas contábil)
    WHEN 'BONUS_CREDITADO', 'BONUS_ESTORNO' THEN
      -- Bônus é gerenciado pela tabela de bônus, não pelo saldo real
      -- Apenas registrar auditoria
      v_bookmaker_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
      IF v_bookmaker_id IS NOT NULL THEN
        SELECT saldo_atual INTO v_saldo_anterior_real FROM bookmakers WHERE id = v_bookmaker_id;
        INSERT INTO bookmaker_balance_audit (
          bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
          origem, referencia_tipo, referencia_id, observacoes, user_id
        ) VALUES (
          v_bookmaker_id, NEW.workspace_id, COALESCE(v_saldo_anterior_real, 0), COALESCE(v_saldo_anterior_real, 0),
          NEW.tipo_transacao, 'cash_ledger', NEW.id, 
          NEW.descricao || ' (bônus - não impacta saldo real)', NEW.user_id
        );
      END IF;
      NEW.balance_processed_at := NOW();
      RETURN NEW;

    -- ======================================================
    -- NOVOS TIPOS FREEBET - AFETAM APENAS saldo_freebet
    -- ======================================================
    
    WHEN 'FREEBET_CREDITADA' THEN
      -- Freebet recebida/liberada → incrementa saldo_freebet
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_valor := COALESCE(NEW.valor_destino, NEW.valor);
      v_operacao := 'CREDITO_FREEBET';
      v_afeta_saldo_freebet := TRUE;
    
    WHEN 'FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA' THEN
      -- Freebet usada ou expirou → decrementa saldo_freebet
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_valor := COALESCE(NEW.valor_origem, NEW.valor);
      v_operacao := 'DEBITO_FREEBET';
      v_afeta_saldo_freebet := TRUE;
    
    WHEN 'FREEBET_ESTORNO' THEN
      -- Estorno de consumo → devolve saldo_freebet
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_valor := COALESCE(NEW.valor_destino, NEW.valor);
      v_operacao := 'CREDITO_FREEBET';
      v_afeta_saldo_freebet := TRUE;
    
    WHEN 'FREEBET_CONVERTIDA' THEN
      -- Conversão: freebet vira saldo real
      -- Debita saldo_freebet E credita saldo_real
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_valor := COALESCE(NEW.valor_destino, NEW.valor);
      v_operacao := 'CONVERSAO_FREEBET';
      v_afeta_saldo_freebet := TRUE;
      v_afeta_saldo_real := TRUE;
    
    -- AJUSTES (direcionais)
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
      v_afeta_saldo_real := TRUE;
    
    -- TRANSFERÊNCIAS (processa ambos os lados)
    WHEN 'TRANSFERENCIA' THEN
      -- Débito na origem
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        SELECT saldo_atual INTO v_saldo_anterior_real FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
        v_saldo_novo_real := COALESCE(v_saldo_anterior_real, 0) - COALESCE(NEW.valor_origem, NEW.valor);
        
        UPDATE bookmakers SET saldo_atual = v_saldo_novo_real, updated_at = NOW()
        WHERE id = NEW.origem_bookmaker_id;
        
        INSERT INTO bookmaker_balance_audit (
          bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
          origem, referencia_tipo, referencia_id, user_id, observacoes
        ) VALUES (
          NEW.origem_bookmaker_id, NEW.workspace_id, COALESCE(v_saldo_anterior_real, 0), v_saldo_novo_real,
          'LEDGER_TRIGGER_V4', NEW.tipo_transacao, NEW.id, NEW.user_id, NEW.descricao || ' (saída)'
        );
      END IF;
      
      -- Crédito no destino
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        SELECT saldo_atual INTO v_saldo_anterior_real FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
        v_saldo_novo_real := COALESCE(v_saldo_anterior_real, 0) + COALESCE(NEW.valor_destino, NEW.valor);
        
        UPDATE bookmakers SET saldo_atual = v_saldo_novo_real, updated_at = NOW()
        WHERE id = NEW.destino_bookmaker_id;
        
        INSERT INTO bookmaker_balance_audit (
          bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
          origem, referencia_tipo, referencia_id, user_id, observacoes
        ) VALUES (
          NEW.destino_bookmaker_id, NEW.workspace_id, COALESCE(v_saldo_anterior_real, 0), v_saldo_novo_real,
          'LEDGER_TRIGGER_V4', NEW.tipo_transacao, NEW.id, NEW.user_id, NEW.descricao || ' (entrada)'
        );
      END IF;
      
      NEW.balance_processed_at := NOW();
      RETURN NEW;
    
    ELSE
      -- Tipo não reconhecido - não processa saldo
      RETURN NEW;
  END CASE;

  -- ======================================================
  -- PROCESSAR SALDO REAL
  -- ======================================================
  
  IF v_afeta_saldo_real AND v_bookmaker_id IS NOT NULL THEN
    SELECT saldo_atual, saldo_freebet INTO v_saldo_anterior_real, v_saldo_anterior_freebet
    FROM bookmakers WHERE id = v_bookmaker_id;
    
    IF NOT FOUND THEN
      RAISE WARNING '[trigger_v4] Bookmaker % não encontrado', v_bookmaker_id;
      RETURN NEW;
    END IF;
    
    v_saldo_anterior_real := COALESCE(v_saldo_anterior_real, 0);
    v_saldo_anterior_freebet := COALESCE(v_saldo_anterior_freebet, 0);
    
    -- Calcular novo saldo baseado na operação
    IF v_operacao = 'CREDITO' THEN
      v_saldo_novo_real := v_saldo_anterior_real + v_valor;
    ELSIF v_operacao = 'DEBITO' THEN
      v_saldo_novo_real := v_saldo_anterior_real - v_valor;
    ELSIF v_operacao = 'CONVERSAO_FREEBET' THEN
      -- Conversão: credita saldo real E debita freebet
      v_saldo_novo_real := v_saldo_anterior_real + v_valor;
      v_saldo_novo_freebet := GREATEST(0, v_saldo_anterior_freebet - v_valor);
    ELSE
      v_saldo_novo_real := v_saldo_anterior_real;
    END IF;
    
    -- Atualizar bookmaker
    IF v_operacao = 'CONVERSAO_FREEBET' THEN
      UPDATE bookmakers 
      SET saldo_atual = v_saldo_novo_real, 
          saldo_freebet = v_saldo_novo_freebet,
          updated_at = NOW()
      WHERE id = v_bookmaker_id;
    ELSE
      UPDATE bookmakers SET saldo_atual = v_saldo_novo_real, updated_at = NOW()
      WHERE id = v_bookmaker_id;
    END IF;
    
    -- Auditoria
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
      origem, referencia_tipo, referencia_id, user_id, observacoes
    ) VALUES (
      v_bookmaker_id, NEW.workspace_id, v_saldo_anterior_real, COALESCE(v_saldo_novo_real, v_saldo_anterior_real),
      'LEDGER_TRIGGER_V4', NEW.tipo_transacao, NEW.id, NEW.user_id, NEW.descricao
    );
  END IF;

  -- ======================================================
  -- PROCESSAR SALDO FREEBET (sem conversão - já foi tratado acima)
  -- ======================================================
  
  IF v_afeta_saldo_freebet AND v_operacao != 'CONVERSAO_FREEBET' AND v_bookmaker_id IS NOT NULL THEN
    SELECT saldo_atual, saldo_freebet INTO v_saldo_anterior_real, v_saldo_anterior_freebet
    FROM bookmakers WHERE id = v_bookmaker_id;
    
    IF NOT FOUND THEN
      RAISE WARNING '[trigger_v4] Bookmaker % não encontrado para freebet', v_bookmaker_id;
      RETURN NEW;
    END IF;
    
    v_saldo_anterior_freebet := COALESCE(v_saldo_anterior_freebet, 0);
    
    -- Calcular novo saldo freebet
    IF v_operacao = 'CREDITO_FREEBET' THEN
      v_saldo_novo_freebet := v_saldo_anterior_freebet + v_valor;
    ELSIF v_operacao = 'DEBITO_FREEBET' THEN
      v_saldo_novo_freebet := GREATEST(0, v_saldo_anterior_freebet - v_valor);
    ELSE
      v_saldo_novo_freebet := v_saldo_anterior_freebet;
    END IF;
    
    -- Atualizar bookmaker
    UPDATE bookmakers SET saldo_freebet = v_saldo_novo_freebet, updated_at = NOW()
    WHERE id = v_bookmaker_id;
    
    -- Auditoria para freebet
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
      origem, referencia_tipo, referencia_id, user_id, observacoes
    ) VALUES (
      v_bookmaker_id, NEW.workspace_id, v_saldo_anterior_freebet, v_saldo_novo_freebet,
      'LEDGER_TRIGGER_V4_FREEBET', NEW.tipo_transacao, NEW.id, NEW.user_id, 
      COALESCE(NEW.descricao, '') || ' [saldo_freebet]'
    );
  END IF;

  -- Marcar como processado
  NEW.balance_processed_at := NOW();
  RETURN NEW;
END;
$$;

-- Dropar trigger antigo e criar novo
DROP TRIGGER IF EXISTS trigger_atualizar_saldo_bookmaker ON cash_ledger;
DROP TRIGGER IF EXISTS trigger_atualizar_saldo_bookmaker_v3 ON cash_ledger;
DROP TRIGGER IF EXISTS trigger_atualizar_saldo_bookmaker_v4 ON cash_ledger;

CREATE TRIGGER trigger_atualizar_saldo_bookmaker_v4
  BEFORE INSERT OR UPDATE ON cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_saldo_bookmaker_v4();

-- 3️⃣ CRIAR RPCs ATÔMICAS PARA FREEBET

-- RPC: Creditar Freebet
CREATE OR REPLACE FUNCTION creditar_freebet(
  p_bookmaker_id UUID,
  p_valor NUMERIC,
  p_origem TEXT DEFAULT 'MANUAL',
  p_projeto_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL,
  p_freebet_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
BEGIN
  -- Buscar workspace e user do bookmaker se não fornecidos
  IF p_workspace_id IS NULL OR p_user_id IS NULL THEN
    SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
    FROM bookmakers WHERE id = p_bookmaker_id;
  ELSE
    v_workspace_id := p_workspace_id;
    v_user_id := p_user_id;
  END IF;

  -- Inserir no ledger
  INSERT INTO cash_ledger (
    tipo_transacao,
    destino_bookmaker_id,
    destino_tipo,
    valor,
    valor_destino,
    moeda,
    tipo_moeda,
    status,
    descricao,
    workspace_id,
    user_id,
    data_transacao,
    impacta_caixa_operacional
  ) VALUES (
    'FREEBET_CREDITADA',
    p_bookmaker_id,
    'BOOKMAKER',
    p_valor,
    p_valor,
    (SELECT moeda FROM bookmakers WHERE id = p_bookmaker_id),
    'FIAT',
    'CONFIRMADO',
    COALESCE(p_descricao, 'Freebet creditada - origem: ' || p_origem),
    v_workspace_id,
    v_user_id,
    NOW(),
    FALSE  -- Freebet não impacta caixa operacional
  )
  RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$;

-- RPC: Consumir Freebet (ao usar em aposta)
CREATE OR REPLACE FUNCTION consumir_freebet(
  p_bookmaker_id UUID,
  p_valor NUMERIC,
  p_aposta_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
BEGIN
  IF p_workspace_id IS NULL OR p_user_id IS NULL THEN
    SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
    FROM bookmakers WHERE id = p_bookmaker_id;
  ELSE
    v_workspace_id := p_workspace_id;
    v_user_id := p_user_id;
  END IF;

  INSERT INTO cash_ledger (
    tipo_transacao,
    origem_bookmaker_id,
    origem_tipo,
    valor,
    valor_origem,
    moeda,
    tipo_moeda,
    status,
    descricao,
    workspace_id,
    user_id,
    data_transacao,
    impacta_caixa_operacional,
    referencia_transacao_id
  ) VALUES (
    'FREEBET_CONSUMIDA',
    p_bookmaker_id,
    'BOOKMAKER',
    p_valor,
    p_valor,
    (SELECT moeda FROM bookmakers WHERE id = p_bookmaker_id),
    'FIAT',
    'CONFIRMADO',
    COALESCE(p_descricao, 'Freebet consumida em aposta'),
    v_workspace_id,
    v_user_id,
    NOW(),
    FALSE,
    NULL  -- Pode ser vinculado ao ledger da aposta se necessário
  )
  RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$;

-- RPC: Estornar Freebet (reversão)
CREATE OR REPLACE FUNCTION estornar_freebet(
  p_bookmaker_id UUID,
  p_valor NUMERIC,
  p_motivo TEXT DEFAULT 'Reversão de aposta',
  p_user_id UUID DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
BEGIN
  IF p_workspace_id IS NULL OR p_user_id IS NULL THEN
    SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
    FROM bookmakers WHERE id = p_bookmaker_id;
  ELSE
    v_workspace_id := p_workspace_id;
    v_user_id := p_user_id;
  END IF;

  INSERT INTO cash_ledger (
    tipo_transacao,
    destino_bookmaker_id,
    destino_tipo,
    valor,
    valor_destino,
    moeda,
    tipo_moeda,
    status,
    descricao,
    workspace_id,
    user_id,
    data_transacao,
    impacta_caixa_operacional
  ) VALUES (
    'FREEBET_ESTORNO',
    p_bookmaker_id,
    'BOOKMAKER',
    p_valor,
    p_valor,
    (SELECT moeda FROM bookmakers WHERE id = p_bookmaker_id),
    'FIAT',
    'CONFIRMADO',
    'Estorno de freebet: ' || p_motivo,
    v_workspace_id,
    v_user_id,
    NOW(),
    FALSE
  )
  RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$;

-- RPC: Expirar Freebet
CREATE OR REPLACE FUNCTION expirar_freebet(
  p_bookmaker_id UUID,
  p_valor NUMERIC,
  p_motivo TEXT DEFAULT 'Expiração por prazo',
  p_user_id UUID DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
BEGIN
  IF p_workspace_id IS NULL OR p_user_id IS NULL THEN
    SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
    FROM bookmakers WHERE id = p_bookmaker_id;
  ELSE
    v_workspace_id := p_workspace_id;
    v_user_id := p_user_id;
  END IF;

  INSERT INTO cash_ledger (
    tipo_transacao,
    origem_bookmaker_id,
    origem_tipo,
    valor,
    valor_origem,
    moeda,
    tipo_moeda,
    status,
    descricao,
    workspace_id,
    user_id,
    data_transacao,
    impacta_caixa_operacional
  ) VALUES (
    'FREEBET_EXPIRADA',
    p_bookmaker_id,
    'BOOKMAKER',
    p_valor,
    p_valor,
    (SELECT moeda FROM bookmakers WHERE id = p_bookmaker_id),
    'FIAT',
    'CONFIRMADO',
    'Freebet expirada: ' || p_motivo,
    v_workspace_id,
    v_user_id,
    NOW(),
    FALSE
  )
  RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$;

-- RPC: Converter Freebet em Saldo Real (extração bem-sucedida)
CREATE OR REPLACE FUNCTION converter_freebet(
  p_bookmaker_id UUID,
  p_valor NUMERIC,
  p_aposta_id UUID DEFAULT NULL,
  p_descricao TEXT DEFAULT 'Extração de freebet',
  p_user_id UUID DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
BEGIN
  IF p_workspace_id IS NULL OR p_user_id IS NULL THEN
    SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
    FROM bookmakers WHERE id = p_bookmaker_id;
  ELSE
    v_workspace_id := p_workspace_id;
    v_user_id := p_user_id;
  END IF;

  -- FREEBET_CONVERTIDA: debita freebet E credita real
  INSERT INTO cash_ledger (
    tipo_transacao,
    destino_bookmaker_id,
    destino_tipo,
    valor,
    valor_destino,
    moeda,
    tipo_moeda,
    status,
    descricao,
    workspace_id,
    user_id,
    data_transacao,
    impacta_caixa_operacional
  ) VALUES (
    'FREEBET_CONVERTIDA',
    p_bookmaker_id,
    'BOOKMAKER',
    p_valor,
    p_valor,
    (SELECT moeda FROM bookmakers WHERE id = p_bookmaker_id),
    'FIAT',
    'CONFIRMADO',
    p_descricao,
    v_workspace_id,
    v_user_id,
    NOW(),
    FALSE  -- Conversão interna, não impacta caixa
  )
  RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$;

-- 4️⃣ ATUALIZAR FUNÇÃO DE RECÁLCULO PARA INCLUIR FREEBET

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
      
      -- Débitos reais
      WHEN cl.origem_bookmaker_id = p_bookmaker_id AND cl.tipo_transacao IN (
        'SAQUE', 'APOSTA_RED', 'APOSTA_MEIO_RED', 'PERDA_CAMBIAL', 'CASHBACK_ESTORNO', 
        'PERDA_OPERACIONAL', 'GIRO_GRATIS_ESTORNO'
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

-- Comentários para documentação
COMMENT ON FUNCTION creditar_freebet IS 'Credita freebet via ledger. Usar ao liberar freebet recebida.';
COMMENT ON FUNCTION consumir_freebet IS 'Debita freebet via ledger. Usar ao registrar aposta com freebet.';
COMMENT ON FUNCTION estornar_freebet IS 'Estorna freebet consumida via ledger. Usar ao editar/deletar aposta.';
COMMENT ON FUNCTION expirar_freebet IS 'Marca freebet como expirada via ledger. Usar para expiração por prazo.';
COMMENT ON FUNCTION converter_freebet IS 'Converte freebet em saldo real via ledger. Usar após extração bem-sucedida.';
COMMENT ON FUNCTION recalcular_saldo_bookmaker_v2 IS 'Recalcula saldo_atual E saldo_freebet baseado no ledger.';