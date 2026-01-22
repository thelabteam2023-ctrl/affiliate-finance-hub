-- ============================================================================
-- MIGRAÇÃO: Suporte Multi-Moeda Completo (3 Camadas)
-- 
-- ARQUITETURA:
-- 1. CAMADA ORIGEM (Transporte): moeda_origem, valor_origem, cotacao_origem_usd
-- 2. CAMADA EXECUÇÃO (Casa): moeda_destino, valor_destino, cotacao_destino_usd
-- 3. CAMADA REFERÊNCIA (KPI): valor_usd_referencia (imutável após criação)
-- ============================================================================

-- Adicionar campo de cotação origem→USD (ex: USDT→USD = 1.0, BTC→USD = 89000)
ALTER TABLE public.cash_ledger 
ADD COLUMN IF NOT EXISTS cotacao_origem_usd NUMERIC;

COMMENT ON COLUMN public.cash_ledger.cotacao_origem_usd IS 
'Taxa de conversão da moeda de origem para USD no momento da transação. Ex: 1 USDT = 1.0 USD, 1 BTC = 89000 USD';

-- Adicionar campo de cotação destino→USD (ex: MXN→USD = 0.0577, EUR→USD = 1.08)
ALTER TABLE public.cash_ledger 
ADD COLUMN IF NOT EXISTS cotacao_destino_usd NUMERIC;

COMMENT ON COLUMN public.cash_ledger.cotacao_destino_usd IS 
'Taxa de conversão da moeda da casa (destino) para USD no momento da transação. Ex: 1 MXN = 0.0577 USD';

-- Adicionar campo de valor de referência em USD (imutável - snapshot histórico)
ALTER TABLE public.cash_ledger 
ADD COLUMN IF NOT EXISTS valor_usd_referencia NUMERIC;

COMMENT ON COLUMN public.cash_ledger.valor_usd_referencia IS 
'Valor consolidado em USD para KPIs globais. Calculado uma vez no momento da transação e NUNCA recalculado.';

-- Adicionar timestamp do snapshot de cotação (para auditoria)
ALTER TABLE public.cash_ledger 
ADD COLUMN IF NOT EXISTS cotacao_snapshot_at TIMESTAMPTZ;

COMMENT ON COLUMN public.cash_ledger.cotacao_snapshot_at IS 
'Momento exato em que as cotações foram capturadas. Para auditoria e rastreabilidade.';

-- ============================================================================
-- ATUALIZAR TRIGGER: Usar valor_destino (moeda da casa) para atualizar saldo
-- ============================================================================

-- O trigger atualizar_saldo_bookmaker_caixa deve usar valor_destino (na moeda da casa)
-- ao invés de 'valor' (que pode estar na moeda de origem)

CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_caixa_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker_id UUID;
  v_delta NUMERIC;
  v_moeda_bk TEXT;
  v_valor_efetivo NUMERIC;
BEGIN
  -- Determinar bookmaker e direção da transação
  IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.destino_bookmaker_id;
    -- IMPORTANTE: Usar valor_destino (moeda da casa), não valor (moeda origem)
    v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
    v_delta := v_valor_efetivo; -- Crédito
  ELSIF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.origem_bookmaker_id;
    v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
    v_delta := -v_valor_efetivo; -- Débito
  ELSIF NEW.tipo_transacao = 'TRANSFERENCIA' THEN
    -- Transferência tem origem E destino
    IF NEW.origem_bookmaker_id IS NOT NULL THEN
      -- Debitar origem
      UPDATE bookmakers 
      SET saldo_atual = saldo_atual - COALESCE(NEW.valor_origem, NEW.valor),
          updated_at = NOW()
      WHERE id = NEW.origem_bookmaker_id;
    END IF;
    
    IF NEW.destino_bookmaker_id IS NOT NULL THEN
      -- Creditar destino
      UPDATE bookmakers 
      SET saldo_atual = saldo_atual + COALESCE(NEW.valor_destino, NEW.valor),
          updated_at = NOW()
      WHERE id = NEW.destino_bookmaker_id;
    END IF;
    
    RETURN NEW;
  ELSE
    -- Outros tipos não afetam saldo de bookmaker via cash_ledger
    RETURN NEW;
  END IF;
  
  -- Só processar transações CONFIRMADAS
  IF NEW.status != 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;
  
  -- Atualizar saldo_atual (coluna canônica para todas as moedas)
  IF v_bookmaker_id IS NOT NULL AND v_delta IS NOT NULL THEN
    UPDATE bookmakers 
    SET saldo_atual = saldo_atual + v_delta,
        updated_at = NOW()
    WHERE id = v_bookmaker_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar/atualizar trigger (drop primeiro para evitar duplicação)
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v2 ON public.cash_ledger;

CREATE TRIGGER tr_cash_ledger_update_bookmaker_balance_v2
  AFTER INSERT ON public.cash_ledger
  FOR EACH ROW
  WHEN (NEW.status = 'CONFIRMADO')
  EXECUTE FUNCTION public.atualizar_saldo_bookmaker_caixa_v2();

-- ============================================================================
-- ÍNDICES para performance de consultas multi-moeda
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_cash_ledger_moeda_destino 
ON public.cash_ledger(moeda_destino) 
WHERE moeda_destino IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_ledger_valor_usd_referencia 
ON public.cash_ledger(valor_usd_referencia) 
WHERE valor_usd_referencia IS NOT NULL;