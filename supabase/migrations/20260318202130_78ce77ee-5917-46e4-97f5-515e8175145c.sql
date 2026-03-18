
CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
  v_last_sv_date timestamptz;
  v_adopted_count integer;
BEGIN
  -- Só dispara quando projeto_id muda de NULL para um valor (vinculação)
  IF OLD.projeto_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  IF NEW.projeto_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- 1. Encontrar a data do último SAQUE_VIRTUAL desta bookmaker (marco de corte)
  SELECT MAX(created_at) INTO v_last_sv_date
  FROM public.cash_ledger
  WHERE tipo_transacao = 'SAQUE_VIRTUAL'
    AND origem_bookmaker_id = NEW.id
    AND status = 'CONFIRMADO';
  
  -- 2. Adotar depósitos e ajustes cambiais órfãos (sem projeto) criados após o último SV
  -- Se v_last_sv_date IS NULL (bookmaker virgem), adota TODOS os órfãos
  UPDATE public.cash_ledger
  SET projeto_id_snapshot = NEW.projeto_id
  WHERE projeto_id_snapshot IS NULL
    AND status = 'CONFIRMADO'
    AND tipo_transacao IN ('DEPOSITO', 'GANHO_CAMBIAL', 'PERDA_CAMBIAL')
    AND (
      destino_bookmaker_id = NEW.id 
      OR origem_bookmaker_id = NEW.id
    )
    AND (v_last_sv_date IS NULL OR created_at > v_last_sv_date);
  
  GET DIAGNOSTICS v_adopted_count = ROW_COUNT;
  
  IF v_adopted_count > 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] Adotados % depósitos/FX órfãos para projeto % (bookmaker %, corte: %)',
      v_adopted_count, NEW.projeto_id, NEW.id, COALESCE(v_last_sv_date::text, 'VIRGEM');
  END IF;
  
  -- 3. DEPOSITO_VIRTUAL (lógica existente)
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
