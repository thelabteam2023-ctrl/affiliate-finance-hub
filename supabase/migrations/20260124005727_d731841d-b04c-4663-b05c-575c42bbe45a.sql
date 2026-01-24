-- ============================================================
-- PROTEÇÃO DE PARCEIROS INATIVOS NOS FLUXOS FINANCEIROS
-- Regra: Parceiro inativo = congelado (nenhuma movimentação)
-- ============================================================

-- 1. Função para validar se parceiro está ativo
CREATE OR REPLACE FUNCTION public.validate_parceiro_ativo_para_transacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_parceiro_status text;
  v_parceiro_nome text;
BEGIN
  -- Verificar parceiro de ORIGEM (quando dinheiro SAI do parceiro)
  IF NEW.origem_parceiro_id IS NOT NULL THEN
    SELECT status, nome INTO v_parceiro_status, v_parceiro_nome
    FROM parceiros
    WHERE id = NEW.origem_parceiro_id;
    
    IF v_parceiro_status IS NOT NULL AND v_parceiro_status != 'ativo' THEN
      RAISE EXCEPTION 'Parceiro de origem "%" está inativo. Não é possível realizar movimentações financeiras.', v_parceiro_nome
        USING HINT = 'Reative o parceiro antes de continuar ou selecione outro parceiro.';
    END IF;
  END IF;
  
  -- Verificar parceiro de DESTINO (quando dinheiro ENTRA no parceiro)
  IF NEW.destino_parceiro_id IS NOT NULL THEN
    SELECT status, nome INTO v_parceiro_status, v_parceiro_nome
    FROM parceiros
    WHERE id = NEW.destino_parceiro_id;
    
    IF v_parceiro_status IS NOT NULL AND v_parceiro_status != 'ativo' THEN
      RAISE EXCEPTION 'Parceiro de destino "%" está inativo. Não é possível realizar movimentações financeiras.', v_parceiro_nome
        USING HINT = 'Reative o parceiro antes de continuar ou selecione outro parceiro.';
    END IF;
  END IF;
  
  -- Verificar bookmaker de ORIGEM (indiretamente via parceiro)
  IF NEW.origem_bookmaker_id IS NOT NULL THEN
    SELECT p.status, p.nome INTO v_parceiro_status, v_parceiro_nome
    FROM bookmakers b
    JOIN parceiros p ON p.id = b.parceiro_id
    WHERE b.id = NEW.origem_bookmaker_id;
    
    IF v_parceiro_status IS NOT NULL AND v_parceiro_status != 'ativo' THEN
      RAISE EXCEPTION 'Parceiro dono da bookmaker de origem "%" está inativo. Operação bloqueada.', v_parceiro_nome
        USING HINT = 'Reative o parceiro antes de continuar.';
    END IF;
  END IF;
  
  -- Verificar bookmaker de DESTINO (indiretamente via parceiro)
  IF NEW.destino_bookmaker_id IS NOT NULL THEN
    SELECT p.status, p.nome INTO v_parceiro_status, v_parceiro_nome
    FROM bookmakers b
    JOIN parceiros p ON p.id = b.parceiro_id
    WHERE b.id = NEW.destino_bookmaker_id;
    
    IF v_parceiro_status IS NOT NULL AND v_parceiro_status != 'ativo' THEN
      RAISE EXCEPTION 'Parceiro dono da bookmaker de destino "%" está inativo. Operação bloqueada.', v_parceiro_nome
        USING HINT = 'Reative o parceiro antes de continuar.';
    END IF;
  END IF;
  
  -- Verificar conta bancária de ORIGEM
  IF NEW.origem_conta_bancaria_id IS NOT NULL THEN
    SELECT p.status, p.nome INTO v_parceiro_status, v_parceiro_nome
    FROM contas_bancarias cb
    JOIN parceiros p ON p.id = cb.parceiro_id
    WHERE cb.id = NEW.origem_conta_bancaria_id;
    
    IF v_parceiro_status IS NOT NULL AND v_parceiro_status != 'ativo' THEN
      RAISE EXCEPTION 'Parceiro dono da conta bancária de origem "%" está inativo. Operação bloqueada.', v_parceiro_nome
        USING HINT = 'Reative o parceiro antes de continuar.';
    END IF;
  END IF;
  
  -- Verificar conta bancária de DESTINO
  IF NEW.destino_conta_bancaria_id IS NOT NULL THEN
    SELECT p.status, p.nome INTO v_parceiro_status, v_parceiro_nome
    FROM contas_bancarias cb
    JOIN parceiros p ON p.id = cb.parceiro_id
    WHERE cb.id = NEW.destino_conta_bancaria_id;
    
    IF v_parceiro_status IS NOT NULL AND v_parceiro_status != 'ativo' THEN
      RAISE EXCEPTION 'Parceiro dono da conta bancária de destino "%" está inativo. Operação bloqueada.', v_parceiro_nome
        USING HINT = 'Reative o parceiro antes de continuar.';
    END IF;
  END IF;
  
  -- Verificar wallet de ORIGEM
  IF NEW.origem_wallet_id IS NOT NULL THEN
    SELECT p.status, p.nome INTO v_parceiro_status, v_parceiro_nome
    FROM wallets_crypto wc
    JOIN parceiros p ON p.id = wc.parceiro_id
    WHERE wc.id = NEW.origem_wallet_id;
    
    IF v_parceiro_status IS NOT NULL AND v_parceiro_status != 'ativo' THEN
      RAISE EXCEPTION 'Parceiro dono da wallet de origem "%" está inativo. Operação bloqueada.', v_parceiro_nome
        USING HINT = 'Reative o parceiro antes de continuar.';
    END IF;
  END IF;
  
  -- Verificar wallet de DESTINO
  IF NEW.destino_wallet_id IS NOT NULL THEN
    SELECT p.status, p.nome INTO v_parceiro_status, v_parceiro_nome
    FROM wallets_crypto wc
    JOIN parceiros p ON p.id = wc.parceiro_id
    WHERE wc.id = NEW.destino_wallet_id;
    
    IF v_parceiro_status IS NOT NULL AND v_parceiro_status != 'ativo' THEN
      RAISE EXCEPTION 'Parceiro dono da wallet de destino "%" está inativo. Operação bloqueada.', v_parceiro_nome
        USING HINT = 'Reative o parceiro antes de continuar.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Trigger no cash_ledger para validar antes de INSERT
DROP TRIGGER IF EXISTS trg_validate_parceiro_ativo_transacao ON cash_ledger;
CREATE TRIGGER trg_validate_parceiro_ativo_transacao
  BEFORE INSERT ON cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION validate_parceiro_ativo_para_transacao();

-- 3. Trigger para bloquear UPDATE em transações de parceiros inativos
-- (impede confirmação de saques pendentes se parceiro foi inativado)
CREATE OR REPLACE FUNCTION public.validate_parceiro_ativo_update_transacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_parceiro_status text;
  v_parceiro_nome text;
BEGIN
  -- Só validar se status está mudando para CONFIRMADO (confirmar saque)
  IF OLD.status = 'PENDENTE' AND NEW.status = 'CONFIRMADO' THEN
    -- Verificar parceiro via bookmaker de origem (caso de saque)
    IF NEW.origem_bookmaker_id IS NOT NULL THEN
      SELECT p.status, p.nome INTO v_parceiro_status, v_parceiro_nome
      FROM bookmakers b
      JOIN parceiros p ON p.id = b.parceiro_id
      WHERE b.id = NEW.origem_bookmaker_id;
      
      IF v_parceiro_status IS NOT NULL AND v_parceiro_status != 'ativo' THEN
        RAISE EXCEPTION 'Não é possível confirmar transação: parceiro "%" está inativo.', v_parceiro_nome
          USING HINT = 'Reative o parceiro antes de confirmar esta operação.';
      END IF;
    END IF;
    
    -- Verificar parceiro de destino
    IF NEW.destino_parceiro_id IS NOT NULL THEN
      SELECT status, nome INTO v_parceiro_status, v_parceiro_nome
      FROM parceiros
      WHERE id = NEW.destino_parceiro_id;
      
      IF v_parceiro_status IS NOT NULL AND v_parceiro_status != 'ativo' THEN
        RAISE EXCEPTION 'Não é possível confirmar transação: parceiro de destino "%" está inativo.', v_parceiro_nome
          USING HINT = 'Reative o parceiro antes de confirmar esta operação.';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_parceiro_ativo_update ON cash_ledger;
CREATE TRIGGER trg_validate_parceiro_ativo_update
  BEFORE UPDATE ON cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION validate_parceiro_ativo_update_transacao();

-- 4. Função para bloquear bookmakers quando parceiro é inativado
CREATE OR REPLACE FUNCTION public.cascade_parceiro_inativo_bookmakers()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Se parceiro está sendo inativado
  IF OLD.status = 'ativo' AND NEW.status = 'inativo' THEN
    -- Atualizar todas as bookmakers para status 'bloqueada'
    -- (não 'encerrada' para permitir reativação)
    UPDATE bookmakers
    SET 
      status = 'bloqueada',
      estado_conta = 'parceiro_inativo',
      updated_at = NOW()
    WHERE parceiro_id = NEW.id
      AND status NOT IN ('encerrada', 'bloqueada');
    
    -- Log para auditoria
    RAISE NOTICE 'Parceiro % inativado. Bookmakers bloqueadas.', NEW.nome;
  END IF;
  
  -- Se parceiro está sendo reativado
  IF OLD.status = 'inativo' AND NEW.status = 'ativo' THEN
    -- Reativar bookmakers que foram bloqueadas por inativação do parceiro
    UPDATE bookmakers
    SET 
      status = 'ativo',
      estado_conta = NULL,
      updated_at = NOW()
    WHERE parceiro_id = NEW.id
      AND status = 'bloqueada'
      AND estado_conta = 'parceiro_inativo';
    
    RAISE NOTICE 'Parceiro % reativado. Bookmakers desbloqueadas.', NEW.nome;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_parceiro_inativo ON parceiros;
CREATE TRIGGER trg_cascade_parceiro_inativo
  AFTER UPDATE OF status ON parceiros
  FOR EACH ROW
  EXECUTE FUNCTION cascade_parceiro_inativo_bookmakers();

-- 5. Adicionar constraint para validar status válidos de bookmaker
-- (incluir 'bloqueada' como status válido)
DO $$
BEGIN
  -- Verificar se a constraint existe antes de tentar dropar
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'bookmakers_status_check'
  ) THEN
    ALTER TABLE bookmakers DROP CONSTRAINT bookmakers_status_check;
  END IF;
END $$;

-- Criar nova constraint com status 'bloqueada'
ALTER TABLE bookmakers
ADD CONSTRAINT bookmakers_status_check 
CHECK (status IN ('ativo', 'ATIVO', 'limitada', 'LIMITADA', 'encerrada', 'ENCERRADA', 'bloqueada', 'BLOQUEADA', 'EM_USO', 'em_uso'));

-- 6. Comentários de documentação
COMMENT ON FUNCTION validate_parceiro_ativo_para_transacao IS 
'Valida que todos os parceiros envolvidos em uma transação financeira estão ativos. 
Bloqueia INSERT no cash_ledger se qualquer parceiro (direto ou via bookmaker/conta/wallet) estiver inativo.';

COMMENT ON FUNCTION validate_parceiro_ativo_update_transacao IS 
'Bloqueia confirmação de transações pendentes (ex: saques) se o parceiro foi inativado após a criação da transação.';

COMMENT ON FUNCTION cascade_parceiro_inativo_bookmakers IS 
'Quando um parceiro é inativado, todas as suas bookmakers são marcadas como bloqueadas.
Quando reativado, as bookmakers que foram bloqueadas por esse motivo são restauradas.';