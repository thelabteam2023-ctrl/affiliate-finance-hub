
CREATE OR REPLACE FUNCTION fn_ensure_deposito_virtual_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
  v_net_real_flow numeric;
  v_virtual_amount numeric;
  v_total_real_flow_all numeric;
BEGIN
  IF NEW.projeto_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  IF NEW.saldo_atual <= 0 THEN
    RETURN NEW;
  END IF;
  
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

  -- Adotar órfãos
  UPDATE public.cash_ledger
  SET projeto_id_snapshot = NEW.projeto_id
  WHERE projeto_id_snapshot IS NULL
    AND status = 'CONFIRMADO'
    AND tipo_transacao IN ('DEPOSITO', 'SAQUE')
    AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id);

  -- Calcular fluxo real do projeto
  SELECT 
    COALESCE(SUM(CASE 
      WHEN tipo_transacao = 'DEPOSITO' AND destino_bookmaker_id = NEW.id THEN valor
      WHEN tipo_transacao = 'SAQUE' AND origem_bookmaker_id = NEW.id THEN -COALESCE(valor_confirmado, valor)
      ELSE 0
    END), 0)
  INTO v_net_real_flow
  FROM public.cash_ledger
  WHERE tipo_transacao IN ('DEPOSITO', 'SAQUE')
    AND status = 'CONFIRMADO'
    AND projeto_id_snapshot = NEW.projeto_id
    AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id);

  -- SAFETY NET: fluxo real total (todos os projetos)
  SELECT COALESCE(SUM(CASE 
    WHEN tipo_transacao = 'DEPOSITO' THEN valor
    WHEN tipo_transacao = 'SAQUE' THEN -COALESCE(valor_confirmado, valor)
    ELSE 0
  END), 0)
  INTO v_total_real_flow_all
  FROM public.cash_ledger
  WHERE tipo_transacao IN ('DEPOSITO', 'SAQUE')
    AND status = 'CONFIRMADO'
    AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id);

  IF v_total_real_flow_all >= NEW.saldo_atual THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_insert] SAFETY NET SKIP: saldo=% covered by total_flow=% bookmaker=% projeto=%',
      NEW.saldo_atual, v_total_real_flow_all, NEW.id, NEW.projeto_id;
    RETURN NEW;
  END IF;

  v_virtual_amount := NEW.saldo_atual - GREATEST(v_net_real_flow, v_total_real_flow_all, 0);

  IF v_virtual_amount <= 0 THEN
    RETURN NEW;
  END IF;
  
  INSERT INTO public.cash_ledger (
    tipo_transacao, status, valor, moeda, tipo_moeda,
    destino_bookmaker_id, projeto_id_snapshot,
    user_id, workspace_id,
    data_transacao, impacta_caixa_operacional,
    descricao
  ) VALUES (
    'DEPOSITO_VIRTUAL', 'CONFIRMADO', v_virtual_amount, NEW.moeda,
    CASE WHEN NEW.moeda IN ('BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'BNB', 'ADA', 'XRP', 'DOGE', 'MATIC') THEN 'CRYPTO' ELSE 'FIAT' END,
    NEW.id, NEW.projeto_id,
    NEW.user_id, NEW.workspace_id,
    CURRENT_DATE, false,
    'Depósito virtual – safety net (trigger automático na criação com projeto)'
  );
  
  RAISE LOG '[fn_ensure_deposito_virtual_on_insert] DV criado: virtual=% (saldo=%, project_flow=%, total_flow=%) bookmaker=% projeto=%',
    v_virtual_amount, NEW.saldo_atual, v_net_real_flow, v_total_real_flow_all, NEW.id, NEW.projeto_id;
  
  RETURN NEW;
END;
$$;
