-- Atualizar trigger para lidar com novos tipos de transação: BONUS_CREDITADO, BONUS_ESTORNO, GANHO_CAMBIAL, PERDA_CAMBIAL
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker_id uuid;
  v_delta numeric;
  v_saldo_anterior numeric;
  v_moeda text;
  v_usa_usd boolean;
  v_campo_saldo text;
BEGIN
  -- Determinar bookmaker_id baseado no tipo de transação
  -- Transações de CRÉDITO usam destino_bookmaker_id
  -- Transações de DÉBITO usam origem_bookmaker_id
  
  IF NEW.tipo_transacao IN (
    'CASHBACK_MANUAL', 
    'PERDA_REVERSAO', 
    'AJUSTE_POSITIVO', 
    'EVENTO_PROMOCIONAL',
    'APOSTA_GREEN',
    'APOSTA_MEIO_GREEN',
    'BONUS_CREDITADO',
    'GANHO_CAMBIAL'
  ) THEN
    -- Transações que CREDITAM no bookmaker
    v_bookmaker_id := NEW.destino_bookmaker_id;
    v_delta := NEW.valor;
  ELSIF NEW.tipo_transacao IN (
    'CASHBACK_ESTORNO', 
    'PERDA_OPERACIONAL', 
    'AJUSTE_NEGATIVO',
    'APOSTA_RED',
    'APOSTA_MEIO_RED',
    'APOSTA_REVERSAO',
    'BONUS_ESTORNO',
    'PERDA_CAMBIAL'
  ) THEN
    -- Transações que DEBITAM do bookmaker
    v_bookmaker_id := NEW.origem_bookmaker_id;
    v_delta := -NEW.valor;
  ELSIF NEW.tipo_transacao = 'APOSTA_VOID' THEN
    -- VOID não impacta saldo, apenas registra
    RETURN NEW;
  ELSE
    -- Outros tipos (DEPOSITO, SAQUE, TRANSFERENCIA) 
    -- já são tratados por outros triggers ou lógica
    RETURN NEW;
  END IF;

  -- Se não há bookmaker_id, não há o que atualizar
  IF v_bookmaker_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar moeda do bookmaker para determinar qual campo usar
  SELECT moeda, saldo_atual INTO v_moeda, v_saldo_anterior
  FROM bookmakers
  WHERE id = v_bookmaker_id;
  
  IF v_moeda IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Determinar se usa saldo_usd (para USD/USDT) ou saldo_atual
  v_usa_usd := v_moeda IN ('USD', 'USDT', 'USDC');
  
  IF v_usa_usd THEN
    v_campo_saldo := 'saldo_usd';
    SELECT saldo_usd INTO v_saldo_anterior FROM bookmakers WHERE id = v_bookmaker_id;
  ELSE
    v_campo_saldo := 'saldo_atual';
    -- v_saldo_anterior já está carregado
  END IF;
  
  -- Atualizar o saldo apropriado
  IF v_usa_usd THEN
    UPDATE bookmakers 
    SET saldo_usd = COALESCE(saldo_usd, 0) + v_delta,
        updated_at = now()
    WHERE id = v_bookmaker_id;
  ELSE
    UPDATE bookmakers 
    SET saldo_atual = COALESCE(saldo_atual, 0) + v_delta,
        updated_at = now()
    WHERE id = v_bookmaker_id;
  END IF;
  
  -- Registrar auditoria
  INSERT INTO bookmaker_balance_audit (
    workspace_id,
    bookmaker_id,
    user_id,
    origem,
    referencia_tipo,
    referencia_id,
    saldo_anterior,
    saldo_novo,
    diferenca,
    observacoes
  ) VALUES (
    NEW.workspace_id,
    v_bookmaker_id,
    NEW.user_id,
    'LEDGER_TRIGGER',
    NEW.tipo_transacao,
    NEW.id,
    COALESCE(v_saldo_anterior, 0),
    COALESCE(v_saldo_anterior, 0) + v_delta,
    v_delta,
    NEW.descricao
  );
  
  RETURN NEW;
END;
$$;