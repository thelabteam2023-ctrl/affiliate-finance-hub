-- Adicionar trigger para INSERT também nos giros_gratis
-- Assim, quando criar um giro já com status='confirmado', o lançamento é gerado

-- Atualizar função para funcionar tanto em INSERT quanto UPDATE
CREATE OR REPLACE FUNCTION public.fn_giro_gratis_gerar_lancamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker RECORD;
  v_ledger_id uuid;
  v_saldo_anterior numeric;
  v_should_process boolean := false;
BEGIN
  -- Para INSERT: processar se já vem como confirmado
  IF TG_OP = 'INSERT' THEN
    v_should_process := NEW.status = 'confirmado' 
                        AND NEW.valor_retorno > 0 
                        AND NEW.cash_ledger_id IS NULL;
  -- Para UPDATE: processar se status mudou para confirmado
  ELSIF TG_OP = 'UPDATE' THEN
    v_should_process := NEW.status = 'confirmado' 
                        AND OLD.status != 'confirmado'
                        AND NEW.valor_retorno > 0 
                        AND NEW.cash_ledger_id IS NULL;
  END IF;

  IF v_should_process THEN
    -- Buscar dados do bookmaker
    SELECT id, nome, saldo_atual, moeda, workspace_id
    INTO v_bookmaker
    FROM bookmakers
    WHERE id = NEW.bookmaker_id;
    
    IF v_bookmaker.id IS NULL THEN
      RAISE EXCEPTION 'Bookmaker não encontrado: %', NEW.bookmaker_id;
    END IF;
    
    v_saldo_anterior := v_bookmaker.saldo_atual;
    
    -- Criar lançamento no cash_ledger
    INSERT INTO cash_ledger (
      workspace_id,
      user_id,
      tipo_transacao,
      tipo_moeda,
      moeda,
      valor,
      data_transacao,
      status,
      descricao,
      destino_tipo,
      destino_bookmaker_id
    ) VALUES (
      NEW.workspace_id,
      NEW.user_id,
      'CREDITO_GIRO',
      'FIAT',
      v_bookmaker.moeda,
      NEW.valor_retorno,
      NEW.data_registro,
      'confirmado',
      'Retorno de Giro Grátis - ' || COALESCE(NEW.observacoes, 'Sem descrição'),
      'bookmaker',
      NEW.bookmaker_id
    )
    RETURNING id INTO v_ledger_id;
    
    -- Vincular lançamento ao giro
    NEW.cash_ledger_id := v_ledger_id;
    
    -- Atualizar saldo do bookmaker
    UPDATE bookmakers 
    SET saldo_atual = saldo_atual + NEW.valor_retorno,
        updated_at = NOW()
    WHERE id = NEW.bookmaker_id;
    
    -- Registrar no audit de saldo
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id,
      workspace_id,
      user_id,
      saldo_anterior,
      saldo_novo,
      diferenca,
      origem,
      referencia_tipo,
      referencia_id,
      observacoes
    ) VALUES (
      NEW.bookmaker_id,
      NEW.workspace_id,
      NEW.user_id,
      v_saldo_anterior,
      v_saldo_anterior + NEW.valor_retorno,
      NEW.valor_retorno,
      'GIRO_GRATIS',
      'giros_gratis',
      NEW.id,
      'Crédito automático - Giro Grátis confirmado'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Atualizar função de cashback para INSERT também
CREATE OR REPLACE FUNCTION public.fn_cashback_gerar_lancamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker RECORD;
  v_ledger_id uuid;
  v_saldo_anterior numeric;
  v_valor_credito numeric;
  v_should_process boolean := false;
BEGIN
  -- Para INSERT: processar se já vem como recebido
  IF TG_OP = 'INSERT' THEN
    v_should_process := NEW.status = 'recebido' 
                        AND NEW.cash_ledger_id IS NULL;
  -- Para UPDATE: processar se status mudou para recebido
  ELSIF TG_OP = 'UPDATE' THEN
    v_should_process := NEW.status = 'recebido' 
                        AND OLD.status != 'recebido'
                        AND NEW.cash_ledger_id IS NULL;
  END IF;

  IF v_should_process THEN
    -- Valor a creditar: valor_recebido se existir, senão valor_calculado
    v_valor_credito := COALESCE(NEW.valor_recebido, NEW.valor_calculado);
    
    IF v_valor_credito <= 0 THEN
      RETURN NEW;
    END IF;
    
    -- Buscar dados do bookmaker
    SELECT id, nome, saldo_atual, moeda, workspace_id
    INTO v_bookmaker
    FROM bookmakers
    WHERE id = NEW.bookmaker_id;
    
    IF v_bookmaker.id IS NULL THEN
      RAISE EXCEPTION 'Bookmaker não encontrado: %', NEW.bookmaker_id;
    END IF;
    
    v_saldo_anterior := v_bookmaker.saldo_atual;
    
    -- Criar lançamento no cash_ledger
    INSERT INTO cash_ledger (
      workspace_id,
      user_id,
      tipo_transacao,
      tipo_moeda,
      moeda,
      valor,
      data_transacao,
      status,
      descricao,
      destino_tipo,
      destino_bookmaker_id
    ) VALUES (
      NEW.workspace_id,
      NEW.user_id,
      'CREDITO_CASHBACK',
      'FIAT',
      NEW.moeda_operacao,
      v_valor_credito,
      COALESCE(NEW.data_credito, CURRENT_DATE),
      'confirmado',
      'Cashback recebido - Período ' || NEW.periodo_inicio || ' a ' || NEW.periodo_fim,
      'bookmaker',
      NEW.bookmaker_id
    )
    RETURNING id INTO v_ledger_id;
    
    -- Vincular lançamento ao registro de cashback
    NEW.cash_ledger_id := v_ledger_id;
    
    -- Atualizar saldo do bookmaker
    UPDATE bookmakers 
    SET saldo_atual = saldo_atual + v_valor_credito,
        updated_at = NOW()
    WHERE id = NEW.bookmaker_id;
    
    -- Registrar no audit de saldo
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id,
      workspace_id,
      user_id,
      saldo_anterior,
      saldo_novo,
      diferenca,
      origem,
      referencia_tipo,
      referencia_id,
      observacoes
    ) VALUES (
      NEW.bookmaker_id,
      NEW.workspace_id,
      NEW.user_id,
      v_saldo_anterior,
      v_saldo_anterior + v_valor_credito,
      v_valor_credito,
      'CASHBACK',
      'cashback_registros',
      NEW.id,
      'Crédito automático - Cashback recebido'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recriar triggers para incluir INSERT
DROP TRIGGER IF EXISTS trg_giro_gratis_lancamento ON giros_gratis;
CREATE TRIGGER trg_giro_gratis_lancamento
  BEFORE INSERT OR UPDATE ON giros_gratis
  FOR EACH ROW
  EXECUTE FUNCTION fn_giro_gratis_gerar_lancamento();

DROP TRIGGER IF EXISTS trg_cashback_lancamento ON cashback_registros;
CREATE TRIGGER trg_cashback_lancamento
  BEFORE INSERT OR UPDATE ON cashback_registros
  FOR EACH ROW
  EXECUTE FUNCTION fn_cashback_gerar_lancamento();