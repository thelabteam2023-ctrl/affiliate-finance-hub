-- ============================================
-- MIGRAÇÃO: Correção definitiva das constraints e triggers do cash_ledger
-- ============================================

-- 1. Remover a constraint antiga de tipo_transacao
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_tipo_transacao_check;

-- 2. Adicionar nova constraint com TODOS os tipos necessários
ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_tipo_transacao_check CHECK (
  tipo_transacao = ANY(ARRAY[
    -- Tipos operacionais básicos
    'DEPOSITO'::text,
    'SAQUE'::text,
    'TRANSFERENCIA'::text,
    
    -- Tipos de investidor/operador
    'APORTE_INVESTIDOR'::text,
    'RESGATE_INVESTIDOR'::text,
    'APORTE_OPERADOR'::text,
    'RESGATE_OPERADOR'::text,
    'APORTE_FINANCEIRO'::text,
    'PAGTO_OPERADOR'::text,
    
    -- Tipos de ajuste e conciliação
    'AJUSTE'::text,
    'AJUSTE_MANUAL'::text,
    'AJUSTE_SALDO'::text,
    'AJUSTE_POSITIVO'::text,
    'AJUSTE_NEGATIVO'::text,
    'CONCILIACAO'::text,
    'ESTORNO'::text,
    
    -- Tipos de eventos promocionais
    'EVENTO_PROMOCIONAL'::text,
    'GIRO_GRATIS_GANHO'::text,
    'FREEBET_CONVERTIDA'::text,
    'BONUS_CREDITADO'::text,
    'BONUS_ESTORNO'::text,
    'CREDITO_PROMOCIONAL'::text,
    
    -- Tipos de cashback e perdas
    'CASHBACK_MANUAL'::text,
    'CASHBACK_ESTORNO'::text,
    'PERDA_OPERACIONAL'::text,
    'PERDA_REVERSAO'::text,
    
    -- Tipos de apostas
    'APOSTA_GREEN'::text,
    'APOSTA_RED'::text,
    'APOSTA_VOID'::text,
    'APOSTA_MEIO_GREEN'::text,
    'APOSTA_MEIO_RED'::text,
    'APOSTA_REVERSAO'::text,
    
    -- Tipos cambiais
    'GANHO_CAMBIAL'::text,
    'PERDA_CAMBIAL'::text,
    'CONVERSAO_INTERNA'::text,
    
    -- Tipos de pagamentos e despesas
    'PAGTO_PARCEIRO'::text,
    'COMISSAO_INDICADOR'::text,
    'BONUS_INDICADOR'::text,
    'DESPESA_ADMINISTRATIVA'::text,
    'CREDITO_GIRO'::text,
    
    -- Tipos de saque específicos
    'SAQUE_CRYPTO'::text,
    'SAQUE_PIX'::text
  ])
);

-- 3. Remover triggers duplicados que chamam a mesma função
DROP TRIGGER IF EXISTS cash_ledger_atualizar_saldo_bookmaker ON public.cash_ledger;
DROP TRIGGER IF EXISTS cash_ledger_balance_update ON public.cash_ledger;
DROP TRIGGER IF EXISTS tr_cash_ledger_atualizar_saldo ON public.cash_ledger;

-- 4. Garantir que existe apenas UM trigger para atualização de saldo
-- Primeiro, vamos recriar a função com suporte adequado a todos os tipos
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
  v_is_credito BOOLEAN;
BEGIN
  -- Ignorar se não há bookmaker envolvido
  IF NEW.destino_bookmaker_id IS NULL AND NEW.origem_bookmaker_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Processar crédito (destino) - aumenta saldo
  IF NEW.destino_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.destino_bookmaker_id;
    v_is_credito := TRUE;
    
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
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo, diferenca,
      origem, referencia_tipo, referencia_id, observacoes, user_id
    ) VALUES (
      v_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_novo, v_delta,
      NEW.tipo_transacao, 'cash_ledger', NEW.id, NEW.descricao, NEW.user_id
    );
  END IF;

  -- Processar débito (origem) - diminui saldo
  IF NEW.origem_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.origem_bookmaker_id;
    v_is_credito := FALSE;
    
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
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo, diferenca,
      origem, referencia_tipo, referencia_id, observacoes, user_id
    ) VALUES (
      v_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_novo, v_delta,
      NEW.tipo_transacao, 'cash_ledger', NEW.id, NEW.descricao, NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Criar único trigger para atualização de saldo
CREATE TRIGGER tr_cash_ledger_update_bookmaker_balance
  AFTER INSERT ON public.cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.atualizar_saldo_bookmaker_v2();

-- 6. Atualizar a função de validação de ajustes para ser mais flexível
CREATE OR REPLACE FUNCTION public.validate_ajuste_manual()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Apenas validar para tipos que REQUEREM motivo
  IF NEW.tipo_transacao IN ('AJUSTE_MANUAL', 'AJUSTE_SALDO', 'ESTORNO', 'CONCILIACAO') THEN
    -- Motivo pode vir de ajuste_motivo OU descricao
    IF (NEW.ajuste_motivo IS NULL OR NEW.ajuste_motivo = '') 
       AND (NEW.descricao IS NULL OR NEW.descricao = '') THEN
      RAISE EXCEPTION 'Ajustes manuais requerem motivo (ajuste_motivo ou descricao)';
    END IF;
    
    -- Direção pode vir de ajuste_direcao OU ser inferida de origem/destino
    IF NEW.ajuste_direcao IS NULL OR NEW.ajuste_direcao = '' THEN
      -- Inferir direção: se tem destino = ENTRADA, se tem origem = SAIDA
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        NEW.ajuste_direcao := 'ENTRADA';
      ELSIF NEW.origem_bookmaker_id IS NOT NULL THEN
        NEW.ajuste_direcao := 'SAIDA';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 7. Garantir que o trigger de validação existe e é BEFORE INSERT
DROP TRIGGER IF EXISTS tr_validate_ajuste_manual ON public.cash_ledger;
CREATE TRIGGER tr_validate_ajuste_manual
  BEFORE INSERT ON public.cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_ajuste_manual();