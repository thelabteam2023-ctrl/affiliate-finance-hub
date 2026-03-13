-- 1. Add INSERT trigger so bookmakers created with projeto_id already set
--    (e.g. via "Receber Contas") also generate DEPOSITO_VIRTUAL
CREATE OR REPLACE FUNCTION fn_ensure_deposito_virtual_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
BEGIN
  -- Only if bookmaker is created with a projeto_id and has balance
  IF NEW.projeto_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  IF NEW.saldo_atual <= 0 THEN
    RETURN NEW;
  END IF;
  
  -- Check for recent duplicate (30s window)
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO'
    AND created_at >= (now() - interval '30 seconds');
  
  IF v_existing_dv_count > 0 THEN
    RETURN NEW;
  END IF;
  
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
    'Depósito virtual – safety net (trigger automático na criação com projeto)'
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_ensure_deposito_virtual_on_insert
  AFTER INSERT ON public.bookmakers
  FOR EACH ROW
  WHEN (NEW.projeto_id IS NOT NULL AND NEW.saldo_atual > 0)
  EXECUTE FUNCTION fn_ensure_deposito_virtual_on_insert();

-- 2. Backfill: Create missing DEPOSITO_VIRTUAL for existing bookmakers 
--    that have projeto_id set but no corresponding DEPOSITO_VIRTUAL
INSERT INTO public.cash_ledger (
  tipo_transacao, status, valor, moeda, tipo_moeda,
  destino_bookmaker_id, projeto_id_snapshot,
  user_id, workspace_id,
  data_transacao, impacta_caixa_operacional,
  descricao
)
SELECT 
  'DEPOSITO_VIRTUAL', 'CONFIRMADO', b.saldo_atual, b.moeda,
  CASE WHEN b.moeda IN ('BTC','ETH','USDT','USDC','SOL','BNB','ADA','XRP','DOGE','MATIC') THEN 'CRYPTO' ELSE 'FIAT' END,
  b.id, b.projeto_id,
  b.user_id, b.workspace_id,
  b.created_at::date, false,
  'Depósito virtual – backfill (contas criadas sem trigger de INSERT)'
FROM public.bookmakers b
WHERE b.projeto_id IS NOT NULL
  AND b.saldo_atual > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.cash_ledger cl
    WHERE cl.tipo_transacao = 'DEPOSITO_VIRTUAL'
      AND cl.destino_bookmaker_id = b.id
      AND cl.projeto_id_snapshot = b.projeto_id
      AND cl.status = 'CONFIRMADO'
  );