
-- Trigger de segurança: Ao vincular bookmaker a projeto (projeto_id muda de NULL para valor),
-- garante que um DEPOSITO_VIRTUAL exista. Se não existir, cria automaticamente.
-- Esta é a "rede de segurança" do banco de dados para garantir integridade financeira.

CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
BEGIN
  -- Só dispara quando projeto_id muda de NULL para um valor (vinculação)
  IF OLD.projeto_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  IF NEW.projeto_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Se saldo é 0, não precisa de DEPOSITO_VIRTUAL
  IF NEW.saldo_atual <= 0 THEN
    RETURN NEW;
  END IF;
  
  -- Verificar se já existe um DEPOSITO_VIRTUAL recente (janela de 30s) para evitar duplicatas
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO'
    AND created_at >= (now() - interval '30 seconds');
  
  IF v_existing_dv_count > 0 THEN
    -- Já existe, application layer criou corretamente
    RETURN NEW;
  END IF;
  
  -- SAFETY NET: Criar DEPOSITO_VIRTUAL automaticamente
  INSERT INTO public.cash_ledger (
    tipo_transacao, status, valor, moeda, tipo_moeda,
    destino_bookmaker_id, projeto_id_snapshot,
    user_id, workspace_id,
    data_transacao, impacta_caixa_operacional,
    descricao
  ) VALUES (
    'DEPOSITO_VIRTUAL', 'CONFIRMADO', NEW.saldo_atual, NEW.moeda,
    CASE WHEN NEW.moeda IN ('BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'BNB', 'ADA', 'XRP', 'DOGE', 'MATIC') THEN 'CRYPTO' ELSE 'FIAT' END,
    NEW.id, NEW.projeto_id,
    NEW.user_id, NEW.workspace_id,
    CURRENT_DATE, false,
    'Depósito virtual – safety net (trigger automático na vinculação)'
  );
  
  RAISE LOG '[fn_ensure_deposito_virtual_on_link] Safety net: DEPOSITO_VIRTUAL criado para bookmaker % -> projeto % (valor: % %)',
    NEW.id, NEW.projeto_id, NEW.saldo_atual, NEW.moeda;
  
  RETURN NEW;
END;
$$;

-- Criar o trigger
DROP TRIGGER IF EXISTS tr_ensure_deposito_virtual_on_link ON public.bookmakers;
CREATE TRIGGER tr_ensure_deposito_virtual_on_link
  AFTER UPDATE OF projeto_id ON public.bookmakers
  FOR EACH ROW
  WHEN (OLD.projeto_id IS NULL AND NEW.projeto_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_ensure_deposito_virtual_on_link();
