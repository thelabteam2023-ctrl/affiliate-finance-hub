
CREATE OR REPLACE FUNCTION fn_ensure_deposito_virtual_on_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
  v_net_real_flow numeric;
  v_virtual_amount numeric;
  v_adopted_count integer;
  v_total_real_flow_all numeric;
BEGIN
  -- Só dispara quando projeto_id muda de NULL para um valor (vinculação)
  IF OLD.projeto_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  IF NEW.projeto_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Se saldo é 0 ou negativo, não precisa de DEPOSITO_VIRTUAL
  IF NEW.saldo_atual <= 0 THEN
    RETURN NEW;
  END IF;
  
  -- Verificar duplicata recente (janela de 30s)
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

  -- ========================================================
  -- PASSO 1: ADOTAR transações órfãs deste bookmaker
  -- Depósitos e saques reais sem projeto atribuído
  -- ========================================================
  UPDATE public.cash_ledger
  SET projeto_id_snapshot = NEW.projeto_id
  WHERE projeto_id_snapshot IS NULL
    AND status = 'CONFIRMADO'
    AND tipo_transacao IN ('DEPOSITO', 'SAQUE')
    AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id);
  
  GET DIAGNOSTICS v_adopted_count = ROW_COUNT;

  IF v_adopted_count > 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] Adopted % orphan transactions for bookmaker % -> projeto %',
      v_adopted_count, NEW.id, NEW.projeto_id;
  END IF;

  -- ========================================================
  -- PASSO 2: Calcular fluxo líquido real já atribuído ao projeto
  -- ========================================================
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

  -- ========================================================
  -- SAFETY NET: Calcular fluxo real TOTAL desta bookmaker
  -- (todos os projetos) para detectar depósitos que já tinham
  -- snapshot de OUTRO mecanismo e não foram contados acima
  -- ========================================================
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

  -- Se o fluxo real total já cobre o saldo, não criar DV
  IF v_total_real_flow_all >= NEW.saldo_atual THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] SAFETY NET SKIP: saldo=% covered by total_flow=% (project_flow=%) bookmaker=% projeto=%',
      NEW.saldo_atual, v_total_real_flow_all, v_net_real_flow, NEW.id, NEW.projeto_id;
    RETURN NEW;
  END IF;

  -- ========================================================
  -- PASSO 3: Virtual = saldo - MAX(fluxo_projeto, fluxo_total)
  -- Usa o maior para máxima proteção contra dupla contagem
  -- ========================================================
  v_virtual_amount := NEW.saldo_atual - GREATEST(v_net_real_flow, v_total_real_flow_all, 0);

  IF v_virtual_amount <= 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] Skipped: saldo=% project_flow=% total_flow=% bookmaker=% projeto=%',
      NEW.saldo_atual, v_net_real_flow, v_total_real_flow_all, NEW.id, NEW.projeto_id;
    RETURN NEW;
  END IF;
  
  -- Criar DEPOSITO_VIRTUAL apenas para o delta não coberto
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
    'Depósito virtual – safety net (trigger automático na vinculação)'
  );
  
  RAISE LOG '[fn_ensure_deposito_virtual_on_link] DV criado: virtual=% (saldo=%, project_flow=%, total_flow=%) bookmaker=% projeto=%',
    v_virtual_amount, NEW.saldo_atual, v_net_real_flow, v_total_real_flow_all, NEW.id, NEW.projeto_id;
  
  RETURN NEW;
END;
$$;
