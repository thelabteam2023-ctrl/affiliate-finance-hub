-- 1. Adicionar campo saldo_usd na tabela bookmakers para suportar multi-moeda
ALTER TABLE public.bookmakers 
ADD COLUMN IF NOT EXISTS saldo_usd NUMERIC NOT NULL DEFAULT 0;

-- 2. Comentário explicativo
COMMENT ON COLUMN public.bookmakers.saldo_usd IS 'Saldo em USD (operações crypto). Separado do saldo_atual (BRL).';
COMMENT ON COLUMN public.bookmakers.saldo_atual IS 'Saldo em BRL (operações fiat). Não deve ser usado para crypto.';

-- 3. Recriar a função de trigger para separar BRL e USD corretamente
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_is_crypto BOOLEAN;
  v_valor NUMERIC;
BEGIN
  -- Determinar se é operação crypto
  v_is_crypto := (NEW.tipo_moeda = 'CRYPTO');
  
  -- Para CRYPTO, usar valor_usd; para FIAT, usar valor
  IF v_is_crypto THEN
    v_valor := COALESCE(NEW.valor_usd, NEW.valor);
  ELSE
    v_valor := NEW.valor;
  END IF;

  -- Para INSERT
  IF TG_OP = 'INSERT' THEN
    -- Depósito (adiciona saldo ao bookmaker de destino)
    IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL AND NEW.status = 'CONFIRMADO' THEN
      IF v_is_crypto THEN
        -- Crypto: atualiza saldo_usd
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd + v_valor,
            updated_at = now()
        WHERE id = NEW.destino_bookmaker_id;
      ELSE
        -- Fiat: atualiza saldo_atual (BRL)
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual + v_valor,
            updated_at = now()
        WHERE id = NEW.destino_bookmaker_id;
      END IF;
    END IF;
    
    -- Saque (subtrai saldo do bookmaker de origem) - apenas quando confirmado
    IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL AND NEW.status = 'CONFIRMADO' THEN
      IF v_is_crypto THEN
        -- Crypto: atualiza saldo_usd
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd - v_valor,
            updated_at = now()
        WHERE id = NEW.origem_bookmaker_id;
      ELSE
        -- Fiat: atualiza saldo_atual (BRL)
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual - v_valor,
            updated_at = now()
        WHERE id = NEW.origem_bookmaker_id;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Para UPDATE (principalmente para SAQUE que muda de PENDENTE para CONFIRMADO)
  IF TG_OP = 'UPDATE' THEN
    -- Se status mudou para CONFIRMADO
    IF OLD.status = 'PENDENTE' AND NEW.status = 'CONFIRMADO' THEN
      -- Saque confirmado: subtrai saldo
      IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        IF v_is_crypto THEN
          UPDATE bookmakers 
          SET saldo_usd = saldo_usd - v_valor,
              updated_at = now()
          WHERE id = NEW.origem_bookmaker_id;
        ELSE
          UPDATE bookmakers 
          SET saldo_atual = saldo_atual - v_valor,
              updated_at = now()
          WHERE id = NEW.origem_bookmaker_id;
        END IF;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Para DELETE
  IF TG_OP = 'DELETE' THEN
    -- Determinar se era crypto
    v_is_crypto := (OLD.tipo_moeda = 'CRYPTO');
    IF v_is_crypto THEN
      v_valor := COALESCE(OLD.valor_usd, OLD.valor);
    ELSE
      v_valor := OLD.valor;
    END IF;
    
    -- Reverter depósito confirmado
    IF OLD.tipo_transacao = 'DEPOSITO' AND OLD.destino_bookmaker_id IS NOT NULL AND OLD.status = 'CONFIRMADO' THEN
      IF v_is_crypto THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd - v_valor,
            updated_at = now()
        WHERE id = OLD.destino_bookmaker_id;
      ELSE
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual - v_valor,
            updated_at = now()
        WHERE id = OLD.destino_bookmaker_id;
      END IF;
    END IF;
    
    -- Reverter saque confirmado
    IF OLD.tipo_transacao = 'SAQUE' AND OLD.origem_bookmaker_id IS NOT NULL AND OLD.status = 'CONFIRMADO' THEN
      IF v_is_crypto THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd + v_valor,
            updated_at = now()
        WHERE id = OLD.origem_bookmaker_id;
      ELSE
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual + v_valor,
            updated_at = now()
        WHERE id = OLD.origem_bookmaker_id;
      END IF;
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$function$;

-- 4. Também atualizar a função atualizar_saldo_bookmaker_caixa para ser consistente
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_caixa()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_bookmaker_id UUID;
  v_valor_alteracao NUMERIC;
  v_is_crypto BOOLEAN;
BEGIN
  -- Only process confirmed transactions
  IF NEW.status != 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;
  
  -- Determinar se é operação crypto
  v_is_crypto := (NEW.tipo_moeda = 'CRYPTO');
  
  -- Para CRYPTO, usar valor_usd; para FIAT, usar valor
  IF v_is_crypto THEN
    v_valor_alteracao := COALESCE(NEW.valor_usd, NEW.valor);
  ELSE
    v_valor_alteracao := NEW.valor;
  END IF;

  -- Check if this is a deposit (to bookmaker)
  IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.destino_bookmaker_id;
    
    IF v_is_crypto THEN
      UPDATE public.bookmakers
      SET saldo_usd = saldo_usd + v_valor_alteracao
      WHERE id = v_bookmaker_id;
    ELSE
      UPDATE public.bookmakers
      SET saldo_atual = saldo_atual + v_valor_alteracao
      WHERE id = v_bookmaker_id;
    END IF;
  END IF;

  -- Check if this is a withdrawal (from bookmaker)
  IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.origem_bookmaker_id;
    
    IF v_is_crypto THEN
      UPDATE public.bookmakers
      SET saldo_usd = saldo_usd - v_valor_alteracao
      WHERE id = v_bookmaker_id;
    ELSE
      UPDATE public.bookmakers
      SET saldo_atual = saldo_atual - v_valor_alteracao
      WHERE id = v_bookmaker_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;