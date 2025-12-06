-- Função para atualizar saldo de bookmakers automaticamente
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker()
RETURNS TRIGGER AS $$
DECLARE
  valor_movimento NUMERIC;
BEGIN
  -- Para INSERT
  IF TG_OP = 'INSERT' THEN
    -- Depósito (adiciona saldo ao bookmaker de destino)
    IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL AND NEW.status = 'CONFIRMADO' THEN
      UPDATE bookmakers 
      SET saldo_atual = saldo_atual + NEW.valor,
          updated_at = now()
      WHERE id = NEW.destino_bookmaker_id;
    END IF;
    
    -- Saque (subtrai saldo do bookmaker de origem) - apenas quando confirmado
    IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL AND NEW.status = 'CONFIRMADO' THEN
      UPDATE bookmakers 
      SET saldo_atual = saldo_atual - NEW.valor,
          updated_at = now()
      WHERE id = NEW.origem_bookmaker_id;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Para UPDATE (principalmente para SAQUE que muda de PENDENTE para CONFIRMADO)
  IF TG_OP = 'UPDATE' THEN
    -- Se status mudou para CONFIRMADO
    IF OLD.status = 'PENDENTE' AND NEW.status = 'CONFIRMADO' THEN
      -- Saque confirmado: subtrai saldo
      IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual - NEW.valor,
            updated_at = now()
        WHERE id = NEW.origem_bookmaker_id;
      END IF;
    END IF;
    
    -- Se status mudou para RECUSADO, não faz nada (saldo já não foi alterado)
    
    RETURN NEW;
  END IF;
  
  -- Para DELETE
  IF TG_OP = 'DELETE' THEN
    -- Reverter depósito confirmado
    IF OLD.tipo_transacao = 'DEPOSITO' AND OLD.destino_bookmaker_id IS NOT NULL AND OLD.status = 'CONFIRMADO' THEN
      UPDATE bookmakers 
      SET saldo_atual = saldo_atual - OLD.valor,
          updated_at = now()
      WHERE id = OLD.destino_bookmaker_id;
    END IF;
    
    -- Reverter saque confirmado
    IF OLD.tipo_transacao = 'SAQUE' AND OLD.origem_bookmaker_id IS NOT NULL AND OLD.status = 'CONFIRMADO' THEN
      UPDATE bookmakers 
      SET saldo_atual = saldo_atual + OLD.valor,
          updated_at = now()
      WHERE id = OLD.origem_bookmaker_id;
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trigger_atualizar_saldo_bookmaker ON cash_ledger;

-- Criar trigger para INSERT, UPDATE e DELETE
CREATE TRIGGER trigger_atualizar_saldo_bookmaker
  AFTER INSERT OR UPDATE OR DELETE ON cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.atualizar_saldo_bookmaker();