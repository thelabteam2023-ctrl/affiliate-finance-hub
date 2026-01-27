-- =============================================================================
-- MIGRATION: Sistema de Dinheiro em Trânsito para Wallets Crypto
-- =============================================================================
-- Implementa o conceito de balance_locked para evitar uso de fundos já enviados
-- mas ainda não confirmados na blockchain/destino.
-- =============================================================================

-- 1. Adicionar colunas de saldo na tabela wallets_crypto
ALTER TABLE public.wallets_crypto
ADD COLUMN IF NOT EXISTS balance_locked NUMERIC DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS balance_locked_updated_at TIMESTAMP WITH TIME ZONE;

-- Comentários explicativos
COMMENT ON COLUMN public.wallets_crypto.balance_locked IS 'Valor em trânsito: enviado mas ainda não confirmado no destino. Em USD.';
COMMENT ON COLUMN public.wallets_crypto.balance_locked_updated_at IS 'Última atualização do saldo travado';

-- 2. Criar ENUM para status transacional (se não existir)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crypto_transit_status') THEN
        CREATE TYPE public.crypto_transit_status AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REVERSED');
    END IF;
END $$;

-- 3. Adicionar coluna de status de trânsito no cash_ledger
ALTER TABLE public.cash_ledger
ADD COLUMN IF NOT EXISTS transit_status TEXT DEFAULT 'CONFIRMED';

-- Atualizar transações existentes baseado na lógica atual
-- Transações CONFIRMADO ficam como CONFIRMED, PENDENTE como PENDING
UPDATE public.cash_ledger 
SET transit_status = CASE 
    WHEN status = 'PENDENTE' THEN 'PENDING'
    ELSE 'CONFIRMED'
END
WHERE transit_status IS NULL AND (origem_wallet_id IS NOT NULL OR destino_wallet_id IS NOT NULL);

-- Comentário
COMMENT ON COLUMN public.cash_ledger.transit_status IS 'Status de trânsito blockchain: PENDING, CONFIRMED, FAILED, REVERSED';

-- 4. Criar view atualizada para saldos de wallet com os 3 valores
DROP VIEW IF EXISTS public.v_wallet_crypto_balances;

CREATE OR REPLACE VIEW public.v_wallet_crypto_balances AS
SELECT 
    p.user_id,
    p.id AS parceiro_id,
    p.nome AS parceiro_nome,
    w.id AS wallet_id,
    w.exchange,
    w.endereco,
    w.network,
    w.moeda,
    w.balance_locked,
    -- Saldo total (confirmado)
    COALESCE(cl_agg.saldo_coin_total, 0) AS balance_total_coin,
    COALESCE(cl_agg.saldo_usd_total, 0) AS balance_total,
    -- Saldo disponível = total - locked
    GREATEST(COALESCE(cl_agg.saldo_usd_total, 0) - COALESCE(w.balance_locked, 0), 0) AS balance_available,
    -- Coin agregado
    cl_agg.coin AS primary_coin
FROM parceiros p
JOIN wallets_crypto w ON w.parceiro_id = p.id
LEFT JOIN LATERAL (
    SELECT 
        cl.coin,
        SUM(
            CASE 
                WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN cl.qtd_coin
                WHEN cl.origem_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN -cl.qtd_coin
                ELSE 0
            END
        ) AS saldo_coin_total,
        SUM(
            CASE 
                WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN COALESCE(cl.valor_usd, 0)
                WHEN cl.origem_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN -COALESCE(cl.valor_usd, 0)
                ELSE 0
            END
        ) AS saldo_usd_total
    FROM cash_ledger cl
    WHERE (cl.destino_wallet_id = w.id OR cl.origem_wallet_id = w.id)
      AND cl.status = 'CONFIRMADO'
      AND cl.workspace_id = get_current_workspace()
    GROUP BY cl.coin
) cl_agg ON true
WHERE p.workspace_id = get_current_workspace();

COMMENT ON VIEW public.v_wallet_crypto_balances IS 'View com saldos de wallets crypto: total, locked e available';

-- 5. Atualizar v_saldo_parceiro_wallets para incluir locked
DROP VIEW IF EXISTS public.v_saldo_parceiro_wallets CASCADE;

CREATE OR REPLACE VIEW public.v_saldo_parceiro_wallets AS
SELECT 
    p.user_id,
    p.id AS parceiro_id,
    p.nome AS parceiro_nome,
    w.id AS wallet_id,
    w.exchange,
    w.endereco,
    cl_agg.coin,
    COALESCE(cl_agg.saldo_coin, 0) AS saldo_coin,
    COALESCE(cl_agg.saldo_usd, 0) AS saldo_usd,
    -- Novos campos
    COALESCE(w.balance_locked, 0) AS saldo_locked,
    GREATEST(COALESCE(cl_agg.saldo_usd, 0) - COALESCE(w.balance_locked, 0), 0) AS saldo_disponivel
FROM parceiros p
JOIN wallets_crypto w ON w.parceiro_id = p.id
LEFT JOIN LATERAL (
    SELECT 
        cl.coin,
        SUM(
            CASE 
                WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN cl.qtd_coin
                WHEN cl.origem_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN -cl.qtd_coin
                ELSE 0
            END
        ) AS saldo_coin,
        SUM(
            CASE 
                WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN COALESCE(cl.valor_usd, 0)
                WHEN cl.origem_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN -COALESCE(cl.valor_usd, 0)
                ELSE 0
            END
        ) AS saldo_usd
    FROM cash_ledger cl
    WHERE (cl.destino_wallet_id = w.id OR cl.origem_wallet_id = w.id)
      AND cl.status = 'CONFIRMADO'
      AND cl.workspace_id = get_current_workspace()
    GROUP BY cl.coin
) cl_agg ON true
WHERE p.workspace_id = get_current_workspace();

-- 6. Criar RPC para travar saldo (quando envia para blockchain)
CREATE OR REPLACE FUNCTION public.lock_wallet_balance(
    p_wallet_id UUID,
    p_valor_usd NUMERIC,
    p_ledger_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_current_locked NUMERIC;
    v_saldo_disponivel NUMERIC;
    v_result JSON;
BEGIN
    -- Buscar saldo atual
    SELECT 
        COALESCE(w.balance_locked, 0),
        COALESCE(vw.saldo_usd, 0) - COALESCE(w.balance_locked, 0)
    INTO v_current_locked, v_saldo_disponivel
    FROM wallets_crypto w
    LEFT JOIN v_saldo_parceiro_wallets vw ON vw.wallet_id = w.id
    WHERE w.id = p_wallet_id
    FOR UPDATE;
    
    -- Validar se há saldo disponível
    IF v_saldo_disponivel < p_valor_usd THEN
        RETURN json_build_object(
            'success', false,
            'error', 'INSUFFICIENT_AVAILABLE_BALANCE',
            'available', v_saldo_disponivel,
            'requested', p_valor_usd
        );
    END IF;
    
    -- Travar o saldo
    UPDATE wallets_crypto
    SET 
        balance_locked = COALESCE(balance_locked, 0) + p_valor_usd,
        balance_locked_updated_at = NOW()
    WHERE id = p_wallet_id;
    
    -- Se tiver ledger_id, atualizar o transit_status
    IF p_ledger_id IS NOT NULL THEN
        UPDATE cash_ledger
        SET transit_status = 'PENDING'
        WHERE id = p_ledger_id;
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'locked_amount', p_valor_usd,
        'new_locked_total', v_current_locked + p_valor_usd,
        'remaining_available', v_saldo_disponivel - p_valor_usd
    );
END;
$$;

-- 7. Criar RPC para confirmar transação (destravar e debitar)
CREATE OR REPLACE FUNCTION public.confirm_wallet_transit(
    p_ledger_id UUID,
    p_valor_confirmado NUMERIC DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_ledger RECORD;
    v_valor_final NUMERIC;
BEGIN
    -- Buscar dados da transação
    SELECT * INTO v_ledger
    FROM cash_ledger
    WHERE id = p_ledger_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'LEDGER_NOT_FOUND');
    END IF;
    
    -- Verificar se está PENDING
    IF v_ledger.transit_status != 'PENDING' THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'INVALID_STATUS',
            'current_status', v_ledger.transit_status
        );
    END IF;
    
    v_valor_final := COALESCE(p_valor_confirmado, v_ledger.valor_usd);
    
    -- Destravar o saldo da wallet de origem
    IF v_ledger.origem_wallet_id IS NOT NULL THEN
        UPDATE wallets_crypto
        SET 
            balance_locked = GREATEST(COALESCE(balance_locked, 0) - v_ledger.valor_usd, 0),
            balance_locked_updated_at = NOW()
        WHERE id = v_ledger.origem_wallet_id;
    END IF;
    
    -- Atualizar status para CONFIRMED
    UPDATE cash_ledger
    SET 
        transit_status = 'CONFIRMED',
        status = 'CONFIRMADO',
        status_valor = 'CONFIRMADO',
        valor_confirmado = v_valor_final,
        updated_at = NOW()
    WHERE id = p_ledger_id;
    
    RETURN json_build_object(
        'success', true,
        'ledger_id', p_ledger_id,
        'valor_confirmado', v_valor_final,
        'previous_status', v_ledger.transit_status
    );
END;
$$;

-- 8. Criar RPC para reverter/falhar transação (destravar sem debitar)
CREATE OR REPLACE FUNCTION public.revert_wallet_transit(
    p_ledger_id UUID,
    p_status TEXT DEFAULT 'FAILED', -- 'FAILED' ou 'REVERSED'
    p_motivo TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_ledger RECORD;
BEGIN
    -- Validar status
    IF p_status NOT IN ('FAILED', 'REVERSED') THEN
        RETURN json_build_object('success', false, 'error', 'INVALID_STATUS_TYPE');
    END IF;
    
    -- Buscar dados da transação
    SELECT * INTO v_ledger
    FROM cash_ledger
    WHERE id = p_ledger_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'LEDGER_NOT_FOUND');
    END IF;
    
    -- Verificar se está PENDING
    IF v_ledger.transit_status != 'PENDING' THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'INVALID_STATUS',
            'current_status', v_ledger.transit_status
        );
    END IF;
    
    -- Destravar o saldo da wallet de origem (sem debitar, pois a transação falhou)
    IF v_ledger.origem_wallet_id IS NOT NULL THEN
        UPDATE wallets_crypto
        SET 
            balance_locked = GREATEST(COALESCE(balance_locked, 0) - v_ledger.valor_usd, 0),
            balance_locked_updated_at = NOW()
        WHERE id = v_ledger.origem_wallet_id;
    END IF;
    
    -- Atualizar status para FAILED ou REVERSED
    UPDATE cash_ledger
    SET 
        transit_status = p_status,
        status = 'CANCELADO',
        descricao = COALESCE(descricao, '') || ' [' || p_status || ': ' || COALESCE(p_motivo, 'Sem motivo') || ']',
        updated_at = NOW()
    WHERE id = p_ledger_id;
    
    RETURN json_build_object(
        'success', true,
        'ledger_id', p_ledger_id,
        'new_status', p_status,
        'funds_released', v_ledger.valor_usd
    );
END;
$$;

-- 9. Criar RPC para obter saldos de uma wallet com os 3 valores
CREATE OR REPLACE FUNCTION public.get_wallet_balances(
    p_wallet_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_result RECORD;
BEGIN
    SELECT 
        w.id,
        w.exchange,
        w.endereco,
        w.network,
        COALESCE(w.balance_locked, 0) as balance_locked,
        COALESCE(vw.saldo_usd, 0) as balance_total,
        GREATEST(COALESCE(vw.saldo_usd, 0) - COALESCE(w.balance_locked, 0), 0) as balance_available,
        COALESCE(vw.saldo_coin, 0) as coin_total,
        vw.coin as primary_coin
    INTO v_result
    FROM wallets_crypto w
    LEFT JOIN v_saldo_parceiro_wallets vw ON vw.wallet_id = w.id
    WHERE w.id = p_wallet_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'WALLET_NOT_FOUND');
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'wallet_id', v_result.id,
        'exchange', v_result.exchange,
        'endereco', v_result.endereco,
        'network', v_result.network,
        'balance_total', v_result.balance_total,
        'balance_locked', v_result.balance_locked,
        'balance_available', v_result.balance_available,
        'coin_total', v_result.coin_total,
        'primary_coin', v_result.primary_coin
    );
END;
$$;

-- 10. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_cash_ledger_transit_status 
ON public.cash_ledger(transit_status) 
WHERE transit_status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_cash_ledger_wallet_transit 
ON public.cash_ledger(origem_wallet_id, destino_wallet_id, transit_status);

-- 11. Criar tabela de log para auditoria de transações em trânsito
CREATE TABLE IF NOT EXISTS public.wallet_transit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets_crypto(id),
    ledger_id UUID REFERENCES cash_ledger(id),
    action TEXT NOT NULL, -- 'LOCK', 'CONFIRM', 'FAIL', 'REVERSE'
    valor_usd NUMERIC NOT NULL,
    balance_locked_before NUMERIC,
    balance_locked_after NUMERIC,
    actor_user_id UUID,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.wallet_transit_log ENABLE ROW LEVEL SECURITY;

-- Política de acesso
CREATE POLICY "workspace_access" ON public.wallet_transit_log
    FOR ALL USING (
        wallet_id IN (
            SELECT wc.id FROM wallets_crypto wc
            JOIN parceiros p ON p.id = wc.parceiro_id
            WHERE p.workspace_id = get_current_workspace()
        )
    );

CREATE INDEX IF NOT EXISTS idx_wallet_transit_log_wallet ON public.wallet_transit_log(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transit_log_pending ON public.wallet_transit_log(created_at) WHERE action = 'LOCK';

COMMENT ON TABLE public.wallet_transit_log IS 'Auditoria de movimentações de saldo em trânsito em wallets crypto';