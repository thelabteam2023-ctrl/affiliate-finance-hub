
-- ============================================================
-- CORREÇÃO: Remover inserção manual na coluna GENERATED 'diferenca'
-- ============================================================
-- A coluna 'diferenca' em bookmaker_balance_audit é GENERATED ALWAYS
-- (calculada automaticamente como saldo_novo - saldo_anterior)
-- O trigger NÃO pode inserir valor nessa coluna
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
  v_saldo_anterior NUMERIC;
  v_saldo_novo NUMERIC;
BEGIN
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- ============================================================
  -- CONVENÇÃO ÚNICA DE SINAIS (v9.4):
  -- ============================================================
  -- DÉBITOS (STAKE, SAQUE): valor JÁ VEM NEGATIVO da RPC
  -- CRÉDITOS (PAYOUT, DEPOSITO): valor JÁ VEM POSITIVO da RPC
  -- O trigger NÃO inverte sinais - usa o valor DIRETAMENTE
  -- ============================================================
  
  CASE NEW.tipo_evento
    -- DÉBITOS: valor já vem NEGATIVO (-1200), usar DIRETO
    WHEN 'STAKE', 'FREEBET_STAKE', 'SAQUE' THEN
      v_delta := NEW.valor;
      
    -- CRÉDITOS: valor já vem POSITIVO (+2364), usar DIRETO
    WHEN 'PAYOUT', 'VOID_REFUND', 'DEPOSITO', 'BONUS', 'CASHBACK', 
         'FREEBET_CREDIT', 'FREEBET_PAYOUT' THEN
      v_delta := NEW.valor;
      
    -- AJUSTE: pode ser positivo ou negativo, usar DIRETO
    WHEN 'AJUSTE' THEN
      v_delta := NEW.valor;
      
    -- REVERSAL: valor invertido, usar DIRETO
    WHEN 'REVERSAL' THEN
      v_delta := NEW.valor;
      
    -- Expiração de freebet: débito, valor já negativo
    WHEN 'FREEBET_EXPIRE' THEN
      v_delta := NEW.valor;
      
    ELSE
      -- Tipo desconhecido: usar valor direto
      v_delta := NEW.valor;
  END CASE;
  
  -- Ignorar delta zero
  IF v_delta = 0 OR v_delta IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Capturar saldo ANTES da atualização
  SELECT 
    CASE WHEN NEW.tipo_uso = 'FREEBET' THEN saldo_freebet ELSE saldo_atual END
  INTO v_saldo_anterior
  FROM bookmakers 
  WHERE id = NEW.bookmaker_id;
  
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
  
  -- Capturar saldo DEPOIS da atualização
  SELECT 
    CASE WHEN NEW.tipo_uso = 'FREEBET' THEN saldo_freebet ELSE saldo_atual END
  INTO v_saldo_novo
  FROM bookmakers 
  WHERE id = NEW.bookmaker_id;
  
  -- Registrar auditoria SEM a coluna 'diferenca' (é GENERATED ALWAYS)
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id,
    workspace_id,
    origem,
    referencia_tipo,
    referencia_id,
    saldo_anterior,
    saldo_novo,
    -- diferenca é GENERATED ALWAYS: calculada automaticamente
    observacoes,
    user_id
  )
  VALUES (
    NEW.bookmaker_id,
    NEW.workspace_id,
    NEW.tipo_evento,
    'financial_events',
    NEW.id,
    v_saldo_anterior,
    v_saldo_novo,
    format('Evento %s: %s', NEW.tipo_evento, COALESCE(NEW.descricao, 'sem descrição')),
    NEW.created_by
  );
  
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
'v9.4 - Correção: não insere na coluna GENERATED diferenca.
Débitos (STAKE) já vêm negativos, créditos (PAYOUT) já vêm positivos.
O trigger NÃO inverte sinais - usa valor DIRETO.';
