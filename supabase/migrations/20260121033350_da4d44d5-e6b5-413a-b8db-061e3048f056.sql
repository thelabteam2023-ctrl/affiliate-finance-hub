
-- PASSO 2: Unificar registros existentes para GIRO_GRATIS
UPDATE cash_ledger
SET tipo_transacao = 'GIRO_GRATIS'
WHERE tipo_transacao = 'CREDITO_GIRO';

UPDATE bookmaker_balance_audit
SET origem = 'GIRO_GRATIS'
WHERE origem = 'CREDITO_GIRO';

-- PASSO 3: Atualizar a função para usar GIRO_GRATIS
CREATE OR REPLACE FUNCTION public.fn_giro_gratis_gerar_lancamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bookmaker RECORD;
  v_ledger_id uuid;
  v_should_process boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should_process := NEW.status = 'confirmado' 
                        AND NEW.valor_retorno > 0 
                        AND NEW.cash_ledger_id IS NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_should_process := NEW.status = 'confirmado' 
                        AND OLD.status != 'confirmado'
                        AND NEW.valor_retorno > 0 
                        AND NEW.cash_ledger_id IS NULL;
  END IF;

  IF v_should_process THEN
    SELECT id, nome, moeda, workspace_id
    INTO v_bookmaker
    FROM bookmakers
    WHERE id = NEW.bookmaker_id;
    
    IF v_bookmaker.id IS NULL THEN
      RAISE EXCEPTION 'Bookmaker não encontrado: %', NEW.bookmaker_id;
    END IF;
    
    -- Tipo unificado: GIRO_GRATIS
    INSERT INTO cash_ledger (
      workspace_id, user_id, tipo_transacao, tipo_moeda, moeda, valor,
      data_transacao, status, descricao, destino_tipo, destino_bookmaker_id,
      impacta_caixa_operacional
    ) VALUES (
      NEW.workspace_id, NEW.user_id, 'GIRO_GRATIS', 'FIAT', v_bookmaker.moeda,
      NEW.valor_retorno, NEW.data_registro, 'CONFIRMADO',
      'Retorno de Giro Grátis - ' || COALESCE(NEW.observacoes, 'Sem descrição'),
      'BOOKMAKER', NEW.bookmaker_id, false
    )
    RETURNING id INTO v_ledger_id;
    
    NEW.cash_ledger_id := v_ledger_id;
  END IF;
  
  RETURN NEW;
END;
$$;
