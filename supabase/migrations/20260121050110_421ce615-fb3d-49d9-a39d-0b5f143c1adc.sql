
-- Corrigir trigger para NÃO inserir coluna 'diferenca' (é generated column)
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
  v_saldo_novo numeric;
  v_is_credito boolean;
BEGIN
  -- Determinar se é crédito ou débito baseado no tipo de transação
  v_is_credito := NEW.tipo_transacao IN (
    'CASHBACK_MANUAL', 
    'PERDA_REVERSAO', 
    'AJUSTE_POSITIVO',
    'BONUS_CREDITADO',
    'DEPOSITO',
    'EVENTO_PROMOCIONAL',
    'GANHO_CAMBIAL',
    'GIRO_GRATIS',
    'APOSTA_GREEN',
    'APOSTA_MEIO_GREEN',
    'APORTE_FINANCEIRO'
  );
  
  -- Para AJUSTE_SALDO, usar ajuste_direcao
  IF NEW.tipo_transacao = 'AJUSTE_SALDO' THEN
    v_is_credito := NEW.ajuste_direcao = 'ENTRADA';
  END IF;

  -- Determinar bookmaker e delta
  IF v_is_credito THEN
    v_bookmaker_id := NEW.destino_bookmaker_id;
    v_delta := NEW.valor;
  ELSE
    v_bookmaker_id := NEW.origem_bookmaker_id;
    v_delta := -NEW.valor;
  END IF;

  -- Se não tem bookmaker associado, não faz nada
  IF v_bookmaker_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar saldo anterior
  SELECT saldo_atual INTO v_saldo_anterior
  FROM bookmakers
  WHERE id = v_bookmaker_id;

  IF v_saldo_anterior IS NULL THEN
    v_saldo_anterior := 0;
  END IF;

  -- Calcular novo saldo
  v_saldo_novo := v_saldo_anterior + v_delta;

  -- Atualizar saldo da bookmaker
  UPDATE bookmakers
  SET saldo_atual = v_saldo_novo,
      updated_at = now()
  WHERE id = v_bookmaker_id;

  -- Registrar auditoria SEM a coluna 'diferenca' (é generated column)
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id,
    workspace_id,
    saldo_anterior,
    saldo_novo,
    origem,
    referencia_tipo,
    referencia_id,
    user_id,
    observacoes
  ) VALUES (
    v_bookmaker_id,
    NEW.workspace_id,
    v_saldo_anterior,
    v_saldo_novo,
    'LEDGER_TRIGGER',
    NEW.tipo_transacao,
    NEW.id,
    NEW.user_id,
    NEW.descricao
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.atualizar_saldo_bookmaker_v2() IS 'Trigger v2 corrigido - não insere diferenca (generated column)';
