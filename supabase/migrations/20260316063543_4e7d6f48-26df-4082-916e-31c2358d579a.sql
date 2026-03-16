
-- =====================================================
-- FIX: Remover adoção de órfãos dos triggers de DEPOSITO_VIRTUAL
-- DEPOSITO_VIRTUAL = saldo_atual (única baseline do projeto)
-- Datas de depósitos antigos NÃO poluem o projeto
-- =====================================================

-- 1. Trigger para vinculação (UPDATE: NULL -> projeto_id)
CREATE OR REPLACE FUNCTION fn_ensure_deposito_virtual_on_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
BEGIN
  -- Ignorar se não tem projeto ou saldo
  IF NEW.projeto_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.saldo_atual <= 0 THEN RETURN NEW; END IF;

  -- Idempotência: verificar DV recente (30s)
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO'
    AND created_at >= (now() - interval '30 seconds');

  IF v_existing_dv_count > 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] SKIP: DV já existe (idempotência) bookmaker=% projeto=%',
      NEW.id, NEW.projeto_id;
    RETURN NEW;
  END IF;

  -- NÃO adotar órfãos. DEPOSITO_VIRTUAL = saldo_atual é a ÚNICA baseline.
  -- Isso garante que a data financeira do projeto = data de vinculação.

  INSERT INTO public.cash_ledger (
    tipo_transacao, status, valor, moeda, tipo_moeda,
    destino_bookmaker_id, projeto_id_snapshot,
    user_id, workspace_id,
    data_transacao, impacta_caixa_operacional,
    descricao
  ) VALUES (
    'DEPOSITO_VIRTUAL', 'CONFIRMADO', NEW.saldo_atual, NEW.moeda,
    CASE WHEN NEW.moeda IN ('BTC','ETH','USDT','USDC','SOL','BNB','ADA','XRP','DOGE','MATIC') THEN 'CRYPTO' ELSE 'FIAT' END,
    NEW.id, NEW.projeto_id,
    NEW.user_id, NEW.workspace_id,
    CURRENT_DATE, false,
    'Depósito virtual – baseline na vinculação (trigger automático)'
  );

  RAISE LOG '[fn_ensure_deposito_virtual_on_link] DV criado: valor=% moeda=% bookmaker=% projeto=%',
    NEW.saldo_atual, NEW.moeda, NEW.id, NEW.projeto_id;

  RETURN NEW;
END;
$$;

-- 2. Trigger para criação com projeto já definido (INSERT)
CREATE OR REPLACE FUNCTION fn_ensure_deposito_virtual_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
BEGIN
  IF NEW.projeto_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.saldo_atual <= 0 THEN RETURN NEW; END IF;

  -- Idempotência: verificar DV recente (30s)
  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO'
    AND created_at >= (now() - interval '30 seconds');

  IF v_existing_dv_count > 0 THEN RETURN NEW; END IF;

  -- NÃO adotar órfãos. DEPOSITO_VIRTUAL = saldo_atual.

  INSERT INTO public.cash_ledger (
    tipo_transacao, status, valor, moeda, tipo_moeda,
    destino_bookmaker_id, projeto_id_snapshot,
    user_id, workspace_id,
    data_transacao, impacta_caixa_operacional,
    descricao
  ) VALUES (
    'DEPOSITO_VIRTUAL', 'CONFIRMADO', NEW.saldo_atual, NEW.moeda,
    CASE WHEN NEW.moeda IN ('BTC','ETH','USDT','USDC','SOL','BNB','ADA','XRP','DOGE','MATIC') THEN 'CRYPTO' ELSE 'FIAT' END,
    NEW.id, NEW.projeto_id,
    NEW.user_id, NEW.workspace_id,
    CURRENT_DATE, false,
    'Depósito virtual – baseline na criação com projeto (trigger automático)'
  );

  RAISE LOG '[fn_ensure_deposito_virtual_on_insert] DV criado: valor=% bookmaker=% projeto=%',
    NEW.saldo_atual, NEW.id, NEW.projeto_id;

  RETURN NEW;
END;
$$;
