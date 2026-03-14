
-- =====================================================
-- FIX: DEPOSITO_VIRTUAL trigger must subtract existing 
-- real deposits already attributed to the project
-- =====================================================

-- 1. Fix the ON LINK trigger
CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_dv_count integer;
  v_existing_real_deposits numeric;
  v_virtual_amount numeric;
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
    RETURN NEW;
  END IF;

  -- NOVO: Calcular quanto do saldo já está coberto por depósitos reais atribuídos a este projeto
  SELECT COALESCE(SUM(CASE WHEN tipo_transacao = 'DEPOSITO' THEN valor ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN tipo_transacao = 'SAQUE' THEN COALESCE(valor_confirmado, valor) ELSE 0 END), 0)
  INTO v_existing_real_deposits
  FROM public.cash_ledger
  WHERE destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id
    AND tipo_transacao IN ('DEPOSITO', 'SAQUE')
    AND status = 'CONFIRMADO'
    AND projeto_id_snapshot = NEW.projeto_id;

  -- Virtual amount = saldo atual menos o que já está rastreado por transações reais
  v_virtual_amount := NEW.saldo_atual - GREATEST(v_existing_real_deposits, 0);

  IF v_virtual_amount <= 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] Skipped: saldo % already covered by real deposits % for bookmaker % -> projeto %',
      NEW.saldo_atual, v_existing_real_deposits, NEW.id, NEW.projeto_id;
    RETURN NEW;
  END IF;
  
  -- SAFETY NET: Criar DEPOSITO_VIRTUAL apenas para o montante NÃO coberto
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
  
  RAISE LOG '[fn_ensure_deposito_virtual_on_link] Safety net: DEPOSITO_VIRTUAL criado para bookmaker % -> projeto % (virtual: % %, saldo: %, real_deposits: %)',
    NEW.id, NEW.projeto_id, v_virtual_amount, NEW.moeda, NEW.saldo_atual, v_existing_real_deposits;
  
  RETURN NEW;
END;
$function$;

-- 2. Fix the ON INSERT trigger (same logic)
CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_dv_count integer;
  v_existing_real_deposits numeric;
  v_virtual_amount numeric;
BEGIN
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

  -- Calcular quanto do saldo já está coberto por depósitos reais
  SELECT COALESCE(SUM(CASE WHEN tipo_transacao = 'DEPOSITO' THEN valor ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN tipo_transacao = 'SAQUE' THEN COALESCE(valor_confirmado, valor) ELSE 0 END), 0)
  INTO v_existing_real_deposits
  FROM public.cash_ledger
  WHERE destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id
    AND tipo_transacao IN ('DEPOSITO', 'SAQUE')
    AND status = 'CONFIRMADO'
    AND projeto_id_snapshot = NEW.projeto_id;

  v_virtual_amount := NEW.saldo_atual - GREATEST(v_existing_real_deposits, 0);

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
  
  RETURN NEW;
END;
$function$;
