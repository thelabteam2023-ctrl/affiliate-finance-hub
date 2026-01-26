
-- ============================================================================
-- FASE 1: REENGENHARIA DO MODELO CONTEXTO OPERACIONAL vs ESTRATÉGIA
-- ============================================================================
-- 
-- OBJETIVO: Separar claramente:
-- 1. ESTRATÉGIA → Verdade financeira (determina ledger, KPI, tipo de lucro)
-- 2. FONTE_SALDO → Pool de capital (REAL, FREEBET, BONUS)
-- 3. CONTEXTO_OPERACIONAL → Apenas UI/UX (de onde veio o formulário)
--
-- ============================================================================

-- 1. ADICIONAR CAMPO fonte_saldo NA apostas_unificada
-- Este campo define EXPLICITAMENTE qual pool de saldo é usado
ALTER TABLE apostas_unificada 
ADD COLUMN IF NOT EXISTS fonte_saldo TEXT DEFAULT 'REAL';

-- Adicionar constraint após popular dados existentes
-- (não podemos fazer CHECK agora pois dados existentes podem ter NULL)

-- 2. POPULAR fonte_saldo BASEADO EM DADOS EXISTENTES
-- Migração retroativa: inferir fonte_saldo do contexto_operacional legado
UPDATE apostas_unificada
SET fonte_saldo = CASE
  WHEN contexto_operacional = 'FREEBET' THEN 'FREEBET'
  WHEN contexto_operacional = 'BONUS' THEN 'BONUS'
  ELSE 'REAL'
END
WHERE fonte_saldo IS NULL OR fonte_saldo = 'REAL';

-- 3. ADICIONAR CONSTRAINT APÓS MIGRAÇÃO
ALTER TABLE apostas_unificada
DROP CONSTRAINT IF EXISTS apostas_unificada_fonte_saldo_check;

ALTER TABLE apostas_unificada
ADD CONSTRAINT apostas_unificada_fonte_saldo_check 
CHECK (fonte_saldo IN ('REAL', 'FREEBET', 'BONUS'));

-- 4. COMENTÁRIO SEMÂNTICO PARA DOCUMENTAÇÃO
COMMENT ON COLUMN apostas_unificada.fonte_saldo IS 
'Pool de capital usado para a aposta: REAL (saldo_atual), FREEBET (saldo_freebet), BONUS (saldo_bonus). 
Determina qual wallet é debitada/creditada. Independente de estratégia e contexto_operacional.';

COMMENT ON COLUMN apostas_unificada.contexto_operacional IS 
'APENAS INFORMATIVO: Indica de onde o formulário foi aberto (tab, OCR, popup). 
NÃO deve ser usado para decisões financeiras. Use fonte_saldo para isso.';

COMMENT ON COLUMN apostas_unificada.estrategia IS 
'VERDADE FINANCEIRA: Determina tipo de ledger entry, KPI impactado e categoria de lucro.
PUNTER, SUREBET, VALUEBET, EXTRACAO_FREEBET, EXTRACAO_BONUS, DUPLO_GREEN.';

-- 5. ADICIONAR fonte_saldo NA apostas_pernas TAMBÉM
-- Cada perna pode usar um pool diferente em operações multi-leg
ALTER TABLE apostas_pernas
ADD COLUMN IF NOT EXISTS fonte_saldo TEXT DEFAULT 'REAL';

ALTER TABLE apostas_pernas
DROP CONSTRAINT IF EXISTS apostas_pernas_fonte_saldo_check;

ALTER TABLE apostas_pernas
ADD CONSTRAINT apostas_pernas_fonte_saldo_check 
CHECK (fonte_saldo IN ('REAL', 'FREEBET', 'BONUS'));

-- 6. CRIAR FUNÇÃO PARA RESOLVER TIPO DE LEDGER POR ESTRATÉGIA
CREATE OR REPLACE FUNCTION resolver_tipo_ledger(
  p_estrategia TEXT,
  p_resultado TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Estratégias especiais com tipos de ledger dedicados
  CASE p_estrategia
    WHEN 'EXTRACAO_FREEBET' THEN
      RETURN CASE p_resultado
        WHEN 'GREEN' THEN 'FREEBET_CONVERTIDA'
        WHEN 'RED' THEN 'FREEBET_CONSUMIDA'
        ELSE 'APOSTA_' || p_resultado
      END;
    
    WHEN 'EXTRACAO_BONUS' THEN
      RETURN CASE p_resultado
        WHEN 'GREEN' THEN 'BONUS_EXTRAIDO'
        WHEN 'RED' THEN 'BONUS_CONSUMIDO'
        ELSE 'APOSTA_' || p_resultado
      END;
    
    ELSE
      -- Estratégias padrão usam tipo genérico
      RETURN 'APOSTA_' || p_resultado;
  END CASE;
END;
$$;

-- 7. CRIAR FUNÇÃO PARA DETERMINAR QUAL SALDO DEBITAR/CREDITAR
CREATE OR REPLACE FUNCTION resolver_impacto_saldo(
  p_fonte_saldo TEXT,
  p_resultado TEXT,
  p_valor NUMERIC
) RETURNS TABLE(
  impacta_saldo_real BOOLEAN,
  impacta_saldo_freebet BOOLEAN,
  impacta_saldo_bonus BOOLEAN,
  delta_real NUMERIC,
  delta_freebet NUMERIC,
  delta_bonus NUMERIC
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Lógica de impacto baseada na fonte de saldo
  CASE p_fonte_saldo
    WHEN 'REAL' THEN
      RETURN QUERY SELECT 
        TRUE, FALSE, FALSE,
        p_valor, 0::NUMERIC, 0::NUMERIC;
    
    WHEN 'FREEBET' THEN
      -- Freebet: perde da freebet, ganha vai pro real
      IF p_resultado IN ('GREEN', 'MEIO_GREEN') THEN
        -- GREEN: debita freebet (stake), credita real (lucro)
        RETURN QUERY SELECT 
          TRUE, TRUE, FALSE,
          p_valor, 0::NUMERIC, 0::NUMERIC; -- Lucro vai pro real
      ELSE
        -- RED: só debita freebet (já foi consumida)
        RETURN QUERY SELECT 
          FALSE, TRUE, FALSE,
          0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
      END IF;
    
    WHEN 'BONUS' THEN
      -- Bônus: similar à freebet
      IF p_resultado IN ('GREEN', 'MEIO_GREEN') THEN
        RETURN QUERY SELECT 
          TRUE, FALSE, TRUE,
          p_valor, 0::NUMERIC, 0::NUMERIC;
      ELSE
        RETURN QUERY SELECT 
          FALSE, FALSE, TRUE,
          0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
      END IF;
    
    ELSE
      -- Fallback para REAL
      RETURN QUERY SELECT 
        TRUE, FALSE, FALSE,
        p_valor, 0::NUMERIC, 0::NUMERIC;
  END CASE;
END;
$$;

-- 8. ATUALIZAR TRIGGER PARA RECONHECER NOVOS TIPOS DE LEDGER
-- Adicionar os novos tipos de transação ao trigger existente
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_v3()
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
  v_campo_saldo TEXT := 'saldo_atual'; -- Pode ser saldo_atual, saldo_freebet ou saldo_bonus
BEGIN
  -- REGRA 1: Não processar se status = PENDENTE
  IF NEW.status IN ('PENDENTE', 'pendente') THEN
    RETURN NEW;
  END IF;
  
  -- REGRA 2: Não reprocessar transações já processadas
  IF NEW.balance_processed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- REGRA 3: Para UPDATE, só processar mudança de PENDENTE para CONFIRMADO
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('PENDENTE', 'pendente') AND NEW.status IN ('CONFIRMADO', 'confirmado') THEN
      NULL;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Determinar bookmaker, valor e operação baseado no tipo de transação
  CASE NEW.tipo_transacao
    -- ========================================
    -- CRÉDITOS EM SALDO REAL (destino_bookmaker_id)
    -- ========================================
    WHEN 'DEPOSITO', 'BONUS_CREDITADO', 'CASHBACK_MANUAL', 'GANHO_CAMBIAL', 
         'APOSTA_GREEN', 'APOSTA_MEIO_GREEN', 'APOSTA_VOID', 'PERDA_REVERSAO', 
         'GIRO_GRATIS', 'BONUS_EXTRAIDO', 'FREEBET_CONVERTIDA' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_valor := COALESCE(NEW.valor_destino, NEW.valor);
      v_operacao := 'CREDITO';
      v_campo_saldo := 'saldo_atual';
    
    -- ========================================
    -- DÉBITOS EM SALDO REAL (origem_bookmaker_id)
    -- ========================================
    WHEN 'SAQUE', 'APOSTA_RED', 'APOSTA_MEIO_RED', 'PERDA_CAMBIAL', 'BONUS_ESTORNO', 
         'CASHBACK_ESTORNO', 'PERDA_OPERACIONAL', 'GIRO_GRATIS_ESTORNO', 
         'APOSTA_REVERSAO', 'BONUS_CONSUMIDO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_valor := COALESCE(NEW.valor_origem, NEW.valor);
      v_operacao := 'DEBITO';
      v_campo_saldo := 'saldo_atual';
    
    -- ========================================
    -- OPERAÇÕES EM SALDO FREEBET
    -- ========================================
    WHEN 'FREEBET_CREDITADA' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_valor := COALESCE(NEW.valor_destino, NEW.valor);
      v_operacao := 'CREDITO';
      v_campo_saldo := 'saldo_freebet';
    
    WHEN 'FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA', 'FREEBET_ESTORNO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_valor := COALESCE(NEW.valor_origem, NEW.valor);
      v_operacao := 'DEBITO';
      v_campo_saldo := 'saldo_freebet';
    
    -- ========================================
    -- AJUSTES MANUAIS (direção determina operação)
    -- ========================================
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
      v_campo_saldo := 'saldo_atual';
    
    -- ========================================
    -- TRANSFERÊNCIA (operação dupla)
    -- ========================================
    WHEN 'TRANSFERENCIA' THEN
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
      
      NEW.balance_processed_at := NOW();
      RETURN NEW;
    
    ELSE
      RETURN NEW;
  END CASE;

  IF v_bookmaker_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obter saldo atual com lock baseado no campo correto
  IF v_campo_saldo = 'saldo_freebet' THEN
    SELECT saldo_freebet INTO v_saldo_anterior FROM bookmakers WHERE id = v_bookmaker_id FOR UPDATE;
  ELSE
    SELECT saldo_atual INTO v_saldo_anterior FROM bookmakers WHERE id = v_bookmaker_id FOR UPDATE;
  END IF;
  
  v_saldo_anterior := COALESCE(v_saldo_anterior, 0);

  -- Calcular novo saldo
  IF v_operacao = 'CREDITO' THEN
    v_saldo_novo := v_saldo_anterior + v_valor;
  ELSE
    v_saldo_novo := v_saldo_anterior - v_valor;
  END IF;

  -- Atualizar saldo correto
  IF v_campo_saldo = 'saldo_freebet' THEN
    UPDATE bookmakers SET saldo_freebet = v_saldo_novo, updated_at = NOW() WHERE id = v_bookmaker_id;
  ELSE
    UPDATE bookmakers SET saldo_atual = v_saldo_novo, updated_at = NOW() WHERE id = v_bookmaker_id;
  END IF;

  -- Registrar auditoria
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id, workspace_id, saldo_anterior, saldo_novo, 
    origem, referencia_tipo, referencia_id, user_id, observacoes
  )
  VALUES (
    v_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_novo, 
    'LEDGER_TRIGGER_V3', NEW.tipo_transacao, NEW.id, NEW.user_id, 
    'Campo: ' || v_campo_saldo
  );

  NEW.balance_processed_at := NOW();
  
  RETURN NEW;
END;
$$;

-- 9. COMENTÁRIOS FINAIS DE DOCUMENTAÇÃO
COMMENT ON FUNCTION resolver_tipo_ledger IS 
'Determina o tipo de entrada no cash_ledger baseado na ESTRATÉGIA da aposta.
Esta é a VERDADE FINANCEIRA - nunca use contexto_operacional para isso.';

COMMENT ON FUNCTION resolver_impacto_saldo IS 
'Determina qual pool de saldo (real/freebet/bonus) é impactado baseado na FONTE_SALDO.
Esta função garante que o dinheiro vai para o lugar certo independente da estratégia.';
