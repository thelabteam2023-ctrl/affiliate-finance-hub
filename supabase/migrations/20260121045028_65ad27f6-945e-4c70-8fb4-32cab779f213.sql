-- Atualizar constraint para incluir TODOS os tipos existentes + GIRO_GRATIS_ESTORNO
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_tipo_transacao_check;

ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_tipo_transacao_check CHECK (
  tipo_transacao IN (
    -- Ajustes
    'AJUSTE_SALDO', 'AJUSTE_MANUAL', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO',
    -- Cashback
    'CASHBACK_MANUAL', 'CASHBACK_ESTORNO',
    -- Apostas
    'APOSTA_GREEN', 'APOSTA_RED', 'APOSTA_VOID', 'APOSTA_MEIO_GREEN', 'APOSTA_MEIO_RED', 'APOSTA_REVERSAO',
    -- Bônus
    'BONUS_CREDITADO', 'BONUS_ESTORNO',
    -- Giros Grátis
    'GIRO_GRATIS', 'GIRO_GRATIS_ESTORNO',
    -- Financeiro
    'DEPOSITO', 'SAQUE', 'TRANSFERENCIA', 'APORTE_FINANCEIRO',
    -- Perdas/Conciliação
    'PERDA_OPERACIONAL', 'PERDA_REVERSAO', 'CONCILIACAO', 'ESTORNO',
    -- Promocional
    'EVENTO_PROMOCIONAL',
    -- Cambial
    'GANHO_CAMBIAL', 'PERDA_CAMBIAL',
    -- Pagamentos
    'PAGTO_PARCEIRO', 'PAGTO_FORNECEDOR', 'PAGTO_OPERADOR',
    -- Comissões
    'COMISSAO_INDICADOR', 'BONUS_INDICADOR',
    -- Despesas
    'DESPESA_ADMINISTRATIVA',
    -- Investidores
    'APORTE_INVESTIDOR', 'RETIRADA_INVESTIDOR'
  )
);

-- Atualizar trigger para processar GIRO_GRATIS_ESTORNO como débito
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

  -- Registrar auditoria
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id,
    workspace_id,
    saldo_anterior,
    saldo_novo,
    diferenca,
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
    v_delta,
    'LEDGER_TRIGGER',
    NEW.tipo_transacao,
    NEW.id,
    NEW.user_id,
    NEW.descricao
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.atualizar_saldo_bookmaker_v2() IS 'Trigger v2 que processa todos os tipos de transação do ledger, incluindo GIRO_GRATIS_ESTORNO';