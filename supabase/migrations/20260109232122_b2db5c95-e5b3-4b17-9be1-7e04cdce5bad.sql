-- Corrigir a função para usar destino_tipo em MAIÚSCULAS (conforme check constraint)
CREATE OR REPLACE FUNCTION public.fn_giro_gratis_gerar_lancamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'BOOKMAKER',  -- CORRIGIDO: maiúsculas
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
$function$;


-- Corrigir também a função de cashback
CREATE OR REPLACE FUNCTION public.fn_cashback_gerar_lancamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bookmaker RECORD;
  v_ledger_id uuid;
  v_saldo_anterior numeric;
  v_should_process boolean := false;
BEGIN
  -- Para INSERT: processar se já vem como recebido
  IF TG_OP = 'INSERT' THEN
    v_should_process := NEW.status = 'recebido' 
                        AND COALESCE(NEW.valor_recebido, 0) > 0 
                        AND NEW.cash_ledger_id IS NULL;
  -- Para UPDATE: processar se status mudou para recebido
  ELSIF TG_OP = 'UPDATE' THEN
    v_should_process := NEW.status = 'recebido' 
                        AND OLD.status != 'recebido'
                        AND COALESCE(NEW.valor_recebido, 0) > 0 
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
      'CREDITO_CASHBACK',
      'FIAT',
      NEW.moeda_operacao,
      NEW.valor_recebido,
      COALESCE(NEW.data_credito, NOW()),
      'confirmado',
      'Crédito de Cashback',
      'BOOKMAKER',  -- CORRIGIDO: maiúsculas
      NEW.bookmaker_id
    )
    RETURNING id INTO v_ledger_id;
    
    -- Vincular lançamento ao cashback
    NEW.cash_ledger_id := v_ledger_id;
    
    -- Atualizar saldo do bookmaker
    UPDATE bookmakers 
    SET saldo_atual = saldo_atual + NEW.valor_recebido,
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
      v_saldo_anterior + NEW.valor_recebido,
      NEW.valor_recebido,
      'CASHBACK',
      'cashback_registros',
      NEW.id,
      'Crédito automático - Cashback recebido'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;