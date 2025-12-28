-- =====================================================
-- MIGRAÇÃO: Suporte Multi-Crypto e Multi-Moeda FIAT
-- =====================================================

-- 1. ADICIONAR CAMPOS DE CONVERSÃO NO cash_ledger
-- =====================================================

-- Campos para rastreabilidade de conversão
ALTER TABLE public.cash_ledger 
  ADD COLUMN IF NOT EXISTS moeda_origem TEXT,
  ADD COLUMN IF NOT EXISTS valor_origem NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS moeda_destino TEXT,
  ADD COLUMN IF NOT EXISTS valor_destino NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS cotacao_implicita NUMERIC(16,8),
  ADD COLUMN IF NOT EXISTS status_valor TEXT DEFAULT 'CONFIRMADO';

-- Comentários explicativos
COMMENT ON COLUMN public.cash_ledger.moeda_origem IS 'Moeda de origem da transação (BRL, USD, EUR, GBP, USDT, BTC, etc.)';
COMMENT ON COLUMN public.cash_ledger.valor_origem IS 'Valor na moeda de origem';
COMMENT ON COLUMN public.cash_ledger.moeda_destino IS 'Moeda operacional do destino (moeda do bookmaker)';
COMMENT ON COLUMN public.cash_ledger.valor_destino IS 'Valor efetivamente creditado na moeda do destino';
COMMENT ON COLUMN public.cash_ledger.cotacao_implicita IS 'Cotação implícita = valor_origem / valor_destino';
COMMENT ON COLUMN public.cash_ledger.status_valor IS 'ESTIMADO (cotação Binance como referência) ou CONFIRMADO (valor real creditado)';

-- 2. RECRIAR A TRIGGER atualizar_saldo_bookmaker
-- A nova lógica usa a MOEDA DO BOOKMAKER para decidir qual saldo atualizar
-- =====================================================

CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker_id UUID;
  v_bookmaker_moeda TEXT;
  v_valor NUMERIC;
  v_is_deposit BOOLEAN;
BEGIN
  -- Para INSERT
  IF TG_OP = 'INSERT' THEN
    -- Depósito: usa valor_destino se disponível, senão valor
    IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL AND NEW.status = 'CONFIRMADO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_is_deposit := TRUE;
      
      -- Buscar moeda operacional do bookmaker
      SELECT moeda INTO v_bookmaker_moeda 
      FROM bookmakers 
      WHERE id = v_bookmaker_id;
      
      -- Usar valor_destino (valor creditado) se existir, senão fallback
      IF NEW.valor_destino IS NOT NULL THEN
        v_valor := NEW.valor_destino;
      ELSIF NEW.tipo_moeda = 'CRYPTO' THEN
        v_valor := COALESCE(NEW.valor_usd, NEW.valor);
      ELSE
        v_valor := NEW.valor;
      END IF;
      
      -- Atualizar saldo baseado na MOEDA DO BOOKMAKER
      IF v_bookmaker_moeda = 'USD' THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd + v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      ELSE
        -- BRL, EUR, GBP ou qualquer outra - usa saldo_atual
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual + v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      END IF;
    END IF;
    
    -- Saque: subtrai do bookmaker de origem
    IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL AND NEW.status = 'CONFIRMADO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      
      -- Buscar moeda operacional do bookmaker
      SELECT moeda INTO v_bookmaker_moeda 
      FROM bookmakers 
      WHERE id = v_bookmaker_id;
      
      -- Usar valor_origem se existir (valor que sai do bookmaker na moeda dele)
      IF NEW.valor_origem IS NOT NULL AND NEW.moeda_origem = v_bookmaker_moeda THEN
        v_valor := NEW.valor_origem;
      ELSIF NEW.tipo_moeda = 'CRYPTO' THEN
        v_valor := COALESCE(NEW.valor_usd, NEW.valor);
      ELSE
        v_valor := NEW.valor;
      END IF;
      
      -- Atualizar saldo baseado na MOEDA DO BOOKMAKER
      IF v_bookmaker_moeda = 'USD' THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd - v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      ELSE
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual - v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Para UPDATE (status PENDENTE -> CONFIRMADO)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'PENDENTE' AND NEW.status = 'CONFIRMADO' THEN
      IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.origem_bookmaker_id;
        
        SELECT moeda INTO v_bookmaker_moeda 
        FROM bookmakers 
        WHERE id = v_bookmaker_id;
        
        IF NEW.valor_origem IS NOT NULL AND NEW.moeda_origem = v_bookmaker_moeda THEN
          v_valor := NEW.valor_origem;
        ELSIF NEW.tipo_moeda = 'CRYPTO' THEN
          v_valor := COALESCE(NEW.valor_usd, NEW.valor);
        ELSE
          v_valor := NEW.valor;
        END IF;
        
        IF v_bookmaker_moeda = 'USD' THEN
          UPDATE bookmakers 
          SET saldo_usd = saldo_usd - v_valor, updated_at = now()
          WHERE id = v_bookmaker_id;
        ELSE
          UPDATE bookmakers 
          SET saldo_atual = saldo_atual - v_valor, updated_at = now()
          WHERE id = v_bookmaker_id;
        END IF;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Para DELETE
  IF TG_OP = 'DELETE' THEN
    -- Reverter depósito confirmado
    IF OLD.tipo_transacao = 'DEPOSITO' AND OLD.destino_bookmaker_id IS NOT NULL AND OLD.status = 'CONFIRMADO' THEN
      v_bookmaker_id := OLD.destino_bookmaker_id;
      
      SELECT moeda INTO v_bookmaker_moeda 
      FROM bookmakers 
      WHERE id = v_bookmaker_id;
      
      IF OLD.valor_destino IS NOT NULL THEN
        v_valor := OLD.valor_destino;
      ELSIF OLD.tipo_moeda = 'CRYPTO' THEN
        v_valor := COALESCE(OLD.valor_usd, OLD.valor);
      ELSE
        v_valor := OLD.valor;
      END IF;
      
      IF v_bookmaker_moeda = 'USD' THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd - v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      ELSE
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual - v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      END IF;
    END IF;
    
    -- Reverter saque confirmado
    IF OLD.tipo_transacao = 'SAQUE' AND OLD.origem_bookmaker_id IS NOT NULL AND OLD.status = 'CONFIRMADO' THEN
      v_bookmaker_id := OLD.origem_bookmaker_id;
      
      SELECT moeda INTO v_bookmaker_moeda 
      FROM bookmakers 
      WHERE id = v_bookmaker_id;
      
      IF OLD.valor_origem IS NOT NULL AND OLD.moeda_origem = v_bookmaker_moeda THEN
        v_valor := OLD.valor_origem;
      ELSIF OLD.tipo_moeda = 'CRYPTO' THEN
        v_valor := COALESCE(OLD.valor_usd, OLD.valor);
      ELSE
        v_valor := OLD.valor;
      END IF;
      
      IF v_bookmaker_moeda = 'USD' THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd + v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      ELSE
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual + v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      END IF;
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;