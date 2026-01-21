
-- CORREÇÃO: Remover atualização duplicada de saldo na função de giro grátis
-- O trigger tr_cash_ledger_update_bookmaker_balance já atualiza o saldo quando o cash_ledger é inserido

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
    
    -- Criar lançamento no cash_ledger
    -- O trigger tr_cash_ledger_update_bookmaker_balance irá atualizar o saldo automaticamente
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
      destino_bookmaker_id,
      impacta_caixa_operacional
    ) VALUES (
      NEW.workspace_id,
      NEW.user_id,
      'CREDITO_GIRO',
      'FIAT',
      v_bookmaker.moeda,
      NEW.valor_retorno,
      NEW.data_registro,
      'CONFIRMADO',
      'Retorno de Giro Grátis - ' || COALESCE(NEW.observacoes, 'Sem descrição'),
      'BOOKMAKER',
      NEW.bookmaker_id,
      false -- Não impacta caixa operacional, apenas saldo da casa
    )
    RETURNING id INTO v_ledger_id;
    
    -- Vincular lançamento ao giro
    NEW.cash_ledger_id := v_ledger_id;
    
    -- REMOVIDO: UPDATE direto no saldo do bookmaker
    -- O trigger tr_cash_ledger_update_bookmaker_balance já faz isso!
    
    -- REMOVIDO: INSERT direto no bookmaker_balance_audit
    -- O trigger tr_cash_ledger_update_bookmaker_balance já faz isso!
  END IF;
  
  RETURN NEW;
END;
$$;

-- Corrigir saldo da 7GAMES que foi incrementado duas vezes
-- saldo_atual atual: 50 | Deveria ser: 25
UPDATE bookmakers
SET saldo_atual = 25.00
WHERE id = '5a9d5ab3-1555-4f4b-ae3a-91a6a9eea5c6';

-- Registrar a correção no audit
INSERT INTO bookmaker_balance_audit (
  bookmaker_id,
  workspace_id,
  user_id,
  saldo_anterior,
  saldo_novo,
  origem,
  observacoes
)
SELECT 
  '5a9d5ab3-1555-4f4b-ae3a-91a6a9eea5c6',
  workspace_id,
  user_id,
  50.00,
  25.00,
  'CORRECAO_SISTEMA',
  'Correção: saldo duplicado por trigger redundante (fn_giro_gratis + tr_cash_ledger_update)'
FROM bookmakers
WHERE id = '5a9d5ab3-1555-4f4b-ae3a-91a6a9eea5c6';
