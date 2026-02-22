
CREATE OR REPLACE FUNCTION fn_giro_gratis_gerar_lancamento()
RETURNS TRIGGER AS $$
DECLARE
  v_bookmaker RECORD;
BEGIN
  -- Processar quando status muda para 'confirmado' (usado pelo frontend) ou 'CONVERTIDO' (legado)
  IF (NEW.status IN ('confirmado', 'CONVERTIDO')) AND (OLD IS NULL OR OLD.status NOT IN ('confirmado', 'CONVERTIDO')) THEN
    IF COALESCE(NEW.valor_retorno, 0) > 0 AND NEW.cash_ledger_id IS NULL THEN
      
      SELECT id, moeda, workspace_id INTO v_bookmaker
      FROM bookmakers WHERE id = NEW.bookmaker_id;
      
      -- Inserir no ledger (trigger v5 atualiza saldo automaticamente)
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
        valor, valor_destino, data_transacao, status, descricao,
        destino_bookmaker_id, impacta_caixa_operacional
      ) VALUES (
        NEW.workspace_id, NEW.user_id, 'GIRO_GRATIS', 'FIAT',
        COALESCE(v_bookmaker.moeda, 'BRL'), NEW.valor_retorno, NEW.valor_retorno,
        COALESCE(NEW.data_jogo, NOW()), 'CONFIRMADO', 'Giro Grátis convertido',
        NEW.bookmaker_id, false
      )
      RETURNING id INTO NEW.cash_ledger_id;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
