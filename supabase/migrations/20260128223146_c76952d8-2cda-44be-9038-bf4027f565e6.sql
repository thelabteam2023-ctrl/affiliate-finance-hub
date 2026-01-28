
-- ============================================================
-- CORREÇÃO CRÍTICA: Bug do Hedge que Credita ao invés de Debitar
-- ============================================================
-- PROBLEMA: O trigger fn_financial_events_sync_balance estava
-- negando o valor de STAKE que já vem NEGATIVO da RPC.
-- Resultado: -(-1200) = +1200 = CRÉDITO ao invés de DÉBITO
-- ============================================================

DROP FUNCTION IF EXISTS fn_financial_events_sync_balance() CASCADE;

CREATE OR REPLACE FUNCTION fn_financial_events_sync_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_delta NUMERIC;
  v_original_tipo TEXT;
BEGIN
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- ============================================================
  -- CONVENÇÃO ÚNICA DE SINAIS (v9.3):
  -- ============================================================
  -- DÉBITOS (STAKE, SAQUE): valor JÁ VEM NEGATIVO da RPC
  -- CRÉDITOS (PAYOUT, DEPOSITO): valor JÁ VEM POSITIVO da RPC
  -- O trigger NÃO inverte sinais - usa o valor DIRETAMENTE
  -- ============================================================
  
  CASE NEW.tipo_evento
    -- DÉBITOS: valor já vem NEGATIVO (-1200), usar DIRETO
    WHEN 'STAKE', 'FREEBET_STAKE', 'SAQUE' THEN
      v_delta := NEW.valor;  -- Ex: -1200 (correto: débito)
      
    -- CRÉDITOS: valor já vem POSITIVO (+2364), usar DIRETO
    WHEN 'PAYOUT', 'VOID_REFUND', 'DEPOSITO', 'BONUS', 'CASHBACK', 
         'FREEBET_CREDIT', 'FREEBET_PAYOUT' THEN
      v_delta := NEW.valor;  -- Ex: +2364 (correto: crédito)
      
    -- AJUSTE: pode ser positivo ou negativo, usar DIRETO
    WHEN 'AJUSTE' THEN
      v_delta := NEW.valor;
      
    -- REVERSAL: O valor no evento é o OPOSTO do original
    -- Ex: Revertendo STAKE original (-30), evento tem +30, queremos CREDITAR
    -- Ex: Revertendo PAYOUT original (+75), evento tem -75, queremos DEBITAR
    WHEN 'REVERSAL' THEN
      -- Reversão já tem valor invertido, usar DIRETO
      v_delta := NEW.valor;
      
    -- Expiração de freebet: débito, valor já negativo
    WHEN 'FREEBET_EXPIRE' THEN
      v_delta := NEW.valor;
      
    ELSE
      -- Tipo desconhecido: usar valor direto (seguro)
      v_delta := NEW.valor;
  END CASE;
  
  -- Ignorar delta zero
  IF v_delta = 0 OR v_delta IS NULL THEN
    RETURN NEW;
  END IF;
  
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
  
  -- Registrar auditoria
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id,
    workspace_id,
    origem,
    referencia_tipo,
    referencia_id,
    saldo_anterior,
    saldo_novo,
    diferenca,
    observacoes,
    user_id
  )
  SELECT
    NEW.bookmaker_id,
    NEW.workspace_id,
    NEW.tipo_evento,
    'financial_events',
    NEW.id,
    CASE WHEN NEW.tipo_uso = 'FREEBET' THEN b.saldo_freebet - v_delta ELSE b.saldo_atual - v_delta END,
    CASE WHEN NEW.tipo_uso = 'FREEBET' THEN b.saldo_freebet ELSE b.saldo_atual END,
    v_delta,
    format('Evento %s: %s', NEW.tipo_evento, COALESCE(NEW.descricao, 'sem descrição')),
    NEW.created_by
  FROM bookmakers b
  WHERE b.id = NEW.bookmaker_id;
  
  RETURN NEW;
END;
$$;

-- Recriar trigger
DROP TRIGGER IF EXISTS tr_financial_events_sync_balance ON financial_events;

CREATE TRIGGER tr_financial_events_sync_balance
  AFTER INSERT ON financial_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_financial_events_sync_balance();

COMMENT ON FUNCTION fn_financial_events_sync_balance IS 
'v9.3 - Correção do bug de inversão de sinal. 
Débitos (STAKE) já vêm negativos, créditos (PAYOUT) já vêm positivos.
O trigger NÃO inverte sinais - usa valor DIRETO.';
