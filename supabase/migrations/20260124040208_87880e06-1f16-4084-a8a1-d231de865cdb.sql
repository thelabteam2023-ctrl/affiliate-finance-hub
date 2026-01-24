
-- Corrigir trigger para incluir valor_destino nas inserções de GIRO_GRATIS
-- Isso garante integridade para reconstrução de saldo via ledger

CREATE OR REPLACE FUNCTION public.fn_giro_gratis_gerar_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- CRÍTICO: valor_destino DEVE ser preenchido para reconstrução de saldo
    INSERT INTO cash_ledger (
      workspace_id, user_id, tipo_transacao, tipo_moeda, moeda, valor,
      valor_destino, -- ADICIONADO: garante integridade ledger
      data_transacao, status, descricao, destino_tipo, destino_bookmaker_id,
      impacta_caixa_operacional
    ) VALUES (
      NEW.workspace_id, NEW.user_id, 'GIRO_GRATIS', 'FIAT', v_bookmaker.moeda,
      NEW.valor_retorno,
      NEW.valor_retorno, -- valor_destino = valor para créditos
      NEW.data_registro, 'CONFIRMADO',
      'Retorno de Giro Grátis - ' || COALESCE(NEW.observacoes, 'Sem descrição'),
      'BOOKMAKER', NEW.bookmaker_id, false
    )
    RETURNING id INTO v_ledger_id;
    
    NEW.cash_ledger_id := v_ledger_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Adicionar comentário explicativo
COMMENT ON FUNCTION public.fn_giro_gratis_gerar_lancamento() IS 
'Trigger que gera lançamento no cash_ledger quando um giro grátis é confirmado. 
IMPORTANTE: Sempre preenche valor_destino para garantir reconstrução de saldo.';
