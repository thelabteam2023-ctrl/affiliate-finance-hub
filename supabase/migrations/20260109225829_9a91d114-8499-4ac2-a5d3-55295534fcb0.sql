-- =====================================================
-- INTEGRAÇÃO FINANCEIRA: GIROS GRÁTIS E CASHBACK
-- =====================================================
-- Objetivo: Garantir que todo valor financeiro real de promoções
-- gere um lançamento no cash_ledger e atualize o saldo da casa

-- 1. Adicionar coluna de referência ao cash_ledger nas tabelas promocionais
-- Isso permite rastrear qual lançamento foi gerado por cada promoção

ALTER TABLE giros_gratis 
ADD COLUMN IF NOT EXISTS cash_ledger_id uuid REFERENCES cash_ledger(id) ON DELETE SET NULL;

ALTER TABLE cashback_registros 
ADD COLUMN IF NOT EXISTS cash_ledger_id uuid REFERENCES cash_ledger(id) ON DELETE SET NULL;

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_giros_gratis_cash_ledger ON giros_gratis(cash_ledger_id) WHERE cash_ledger_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashback_registros_cash_ledger ON cashback_registros(cash_ledger_id) WHERE cash_ledger_id IS NOT NULL;

-- 3. Função para gerar lançamento financeiro de Giro Grátis
CREATE OR REPLACE FUNCTION public.fn_giro_gratis_gerar_lancamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker RECORD;
  v_ledger_id uuid;
  v_saldo_anterior numeric;
BEGIN
  -- Só processa se status mudou para 'confirmado' E tem valor_retorno > 0
  IF NEW.status = 'confirmado' 
     AND (OLD.status IS NULL OR OLD.status != 'confirmado')
     AND NEW.valor_retorno > 0 
     AND NEW.cash_ledger_id IS NULL THEN
    
    -- Buscar dados do bookmaker
    SELECT id, nome, saldo_atual, moeda, workspace_id
    INTO v_bookmaker
    FROM bookmakers
    WHERE id = NEW.bookmaker_id;
    
    IF v_bookmaker.id IS NULL THEN
      RAISE EXCEPTION 'Bookmaker não encontrado: %', NEW.bookmaker_id;
    END IF;
    
    v_saldo_anterior := v_bookmaker.saldo_atual;
    
    -- Criar lançamento no cash_ledger
    INSERT INTO cash_ledger (
      workspace_id,
      user_id,
      tipo_transacao,
      tipo_moeda,
      moeda,
      valor,
      data_transacao,
      status,
      descricao,
      destino_tipo,
      destino_bookmaker_id
    ) VALUES (
      NEW.workspace_id,
      NEW.user_id,
      'CREDITO_GIRO',
      'FIAT',
      v_bookmaker.moeda,
      NEW.valor_retorno,
      NEW.data_registro,
      'confirmado',
      'Retorno de Giro Grátis - ' || COALESCE(NEW.observacoes, 'Sem descrição'),
      'bookmaker',
      NEW.bookmaker_id
    )
    RETURNING id INTO v_ledger_id;
    
    -- Vincular lançamento ao giro
    NEW.cash_ledger_id := v_ledger_id;
    
    -- Atualizar saldo do bookmaker
    UPDATE bookmakers 
    SET saldo_atual = saldo_atual + NEW.valor_retorno,
        updated_at = NOW()
    WHERE id = NEW.bookmaker_id;
    
    -- Registrar no audit de saldo
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id,
      workspace_id,
      user_id,
      saldo_anterior,
      saldo_novo,
      diferenca,
      origem,
      referencia_tipo,
      referencia_id,
      observacoes
    ) VALUES (
      NEW.bookmaker_id,
      NEW.workspace_id,
      NEW.user_id,
      v_saldo_anterior,
      v_saldo_anterior + NEW.valor_retorno,
      NEW.valor_retorno,
      'GIRO_GRATIS',
      'giros_gratis',
      NEW.id,
      'Crédito automático - Giro Grátis confirmado'
    );
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- 4. Função para gerar lançamento financeiro de Cashback
CREATE OR REPLACE FUNCTION public.fn_cashback_gerar_lancamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker RECORD;
  v_ledger_id uuid;
  v_saldo_anterior numeric;
  v_valor_credito numeric;
BEGIN
  -- Só processa se status mudou para 'recebido' E tem valor
  IF NEW.status = 'recebido' 
     AND (OLD.status IS NULL OR OLD.status != 'recebido')
     AND NEW.cash_ledger_id IS NULL THEN
    
    -- Valor a creditar: valor_recebido se existir, senão valor_calculado
    v_valor_credito := COALESCE(NEW.valor_recebido, NEW.valor_calculado);
    
    IF v_valor_credito <= 0 THEN
      RETURN NEW;
    END IF;
    
    -- Buscar dados do bookmaker
    SELECT id, nome, saldo_atual, moeda, workspace_id
    INTO v_bookmaker
    FROM bookmakers
    WHERE id = NEW.bookmaker_id;
    
    IF v_bookmaker.id IS NULL THEN
      RAISE EXCEPTION 'Bookmaker não encontrado: %', NEW.bookmaker_id;
    END IF;
    
    v_saldo_anterior := v_bookmaker.saldo_atual;
    
    -- Criar lançamento no cash_ledger
    INSERT INTO cash_ledger (
      workspace_id,
      user_id,
      tipo_transacao,
      tipo_moeda,
      moeda,
      valor,
      data_transacao,
      status,
      descricao,
      destino_tipo,
      destino_bookmaker_id
    ) VALUES (
      NEW.workspace_id,
      NEW.user_id,
      'CREDITO_CASHBACK',
      'FIAT',
      NEW.moeda_operacao,
      v_valor_credito,
      COALESCE(NEW.data_credito, CURRENT_DATE),
      'confirmado',
      'Cashback recebido - Período ' || NEW.periodo_inicio || ' a ' || NEW.periodo_fim,
      'bookmaker',
      NEW.bookmaker_id
    )
    RETURNING id INTO v_ledger_id;
    
    -- Vincular lançamento ao registro de cashback
    NEW.cash_ledger_id := v_ledger_id;
    
    -- Atualizar saldo do bookmaker
    UPDATE bookmakers 
    SET saldo_atual = saldo_atual + v_valor_credito,
        updated_at = NOW()
    WHERE id = NEW.bookmaker_id;
    
    -- Registrar no audit de saldo
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id,
      workspace_id,
      user_id,
      saldo_anterior,
      saldo_novo,
      diferenca,
      origem,
      referencia_tipo,
      referencia_id,
      observacoes
    ) VALUES (
      NEW.bookmaker_id,
      NEW.workspace_id,
      NEW.user_id,
      v_saldo_anterior,
      v_saldo_anterior + v_valor_credito,
      v_valor_credito,
      'CASHBACK',
      'cashback_registros',
      NEW.id,
      'Crédito automático - Cashback recebido'
    );
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- 5. Criar triggers (remover se existirem para evitar duplicação)
DROP TRIGGER IF EXISTS trg_giro_gratis_lancamento ON giros_gratis;
CREATE TRIGGER trg_giro_gratis_lancamento
  BEFORE UPDATE ON giros_gratis
  FOR EACH ROW
  EXECUTE FUNCTION fn_giro_gratis_gerar_lancamento();

DROP TRIGGER IF EXISTS trg_cashback_lancamento ON cashback_registros;
CREATE TRIGGER trg_cashback_lancamento
  BEFORE UPDATE ON cashback_registros
  FOR EACH ROW
  EXECUTE FUNCTION fn_cashback_gerar_lancamento();

-- 6. Comentários para documentação
COMMENT ON COLUMN giros_gratis.cash_ledger_id IS 'Referência ao lançamento financeiro gerado quando o giro foi confirmado';
COMMENT ON COLUMN cashback_registros.cash_ledger_id IS 'Referência ao lançamento financeiro gerado quando o cashback foi recebido';
COMMENT ON FUNCTION fn_giro_gratis_gerar_lancamento IS 'Gera lançamento no cash_ledger e atualiza saldo do bookmaker ao confirmar giro grátis';
COMMENT ON FUNCTION fn_cashback_gerar_lancamento IS 'Gera lançamento no cash_ledger e atualiza saldo do bookmaker ao receber cashback';