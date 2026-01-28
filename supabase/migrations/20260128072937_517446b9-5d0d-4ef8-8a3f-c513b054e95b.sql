
-- CORREÇÃO: Lógica de reversão no trigger e RPC
-- 
-- PROBLEMA: REVERSAL com valor negativo está debitando ao invés de creditar
-- 
-- SOLUÇÃO: O trigger precisa entender que REVERSAL inverte o EFEITO do original
-- Se original era STAKE (débito), reversal é crédito
-- Se original era PAYOUT (crédito), reversal é débito

-- Atualizar trigger para tratar REVERSAL corretamente
CREATE OR REPLACE FUNCTION fn_financial_events_sync_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_delta NUMERIC;
  v_original_tipo TEXT;
BEGIN
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  CASE NEW.tipo_evento
    -- Débitos (stake sai do saldo) - valor é POSITIVO no evento
    WHEN 'STAKE' THEN
      v_delta := -NEW.valor;
    WHEN 'FREEBET_STAKE' THEN
      v_delta := -NEW.valor;
      
    -- Créditos (payout entra no saldo) - valor é POSITIVO no evento
    WHEN 'PAYOUT', 'VOID_REFUND', 'DEPOSITO', 'BONUS', 'CASHBACK', 'FREEBET_CREDIT', 'FREEBET_PAYOUT' THEN
      v_delta := NEW.valor;
      
    -- Ajuste pode ser positivo ou negativo
    WHEN 'AJUSTE' THEN
      v_delta := NEW.valor;
      
    -- Saque é débito (valor já vem negativo no evento)
    WHEN 'SAQUE' THEN
      v_delta := NEW.valor;
      
    -- REVERSAL: O valor no evento é o OPOSTO do original
    -- Se revertendo STAKE (original +30), evento tem -30, queremos CREDITAR 30
    -- Se revertendo PAYOUT (original +75), evento tem -75, queremos DEBITAR 75
    -- A lógica depende do tipo do evento original
    WHEN 'REVERSAL' THEN
      -- Buscar tipo do evento original para saber como reverter
      IF NEW.reversed_event_id IS NOT NULL THEN
        SELECT tipo_evento INTO v_original_tipo 
        FROM financial_events 
        WHERE id = NEW.reversed_event_id;
        
        -- Se original era débito (STAKE), reversão é crédito
        -- Se original era crédito (PAYOUT), reversão é débito
        IF v_original_tipo IN ('STAKE', 'FREEBET_STAKE') THEN
          -- Original debitou, então reversão CREDITA (valor negativo vira positivo)
          v_delta := -NEW.valor;  -- -(-30) = +30 = crédito
        ELSIF v_original_tipo IN ('PAYOUT', 'VOID_REFUND', 'DEPOSITO', 'BONUS', 'CASHBACK', 'FREEBET_CREDIT', 'FREEBET_PAYOUT') THEN
          -- Original creditou, então reversão DEBITA (valor negativo permanece)
          v_delta := NEW.valor;  -- -75 = débito
        ELSE
          -- Fallback: usa valor direto
          v_delta := -NEW.valor;
        END IF;
      ELSE
        -- Sem evento original, assume inversão simples
        v_delta := -NEW.valor;
      END IF;
      
    -- Expiração de freebet
    WHEN 'FREEBET_EXPIRE' THEN
      v_delta := NEW.valor;
      
    ELSE
      v_delta := 0;
  END CASE;
  
  -- Aplicar delta no saldo correto
  IF NEW.tipo_uso = 'FREEBET' THEN
    UPDATE bookmakers 
    SET saldo_freebet = saldo_freebet + v_delta,
        updated_at = now()
    WHERE id = NEW.bookmaker_id;
  ELSE
    UPDATE bookmakers 
    SET saldo_atual = saldo_atual + v_delta,
        updated_at = now()
    WHERE id = NEW.bookmaker_id;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_financial_events_sync_balance() IS 
'Financial Engine v9.1 - Trigger que sincroniza saldos automaticamente.
REVERSAL agora consulta o tipo do evento original para aplicar inversão correta.';
