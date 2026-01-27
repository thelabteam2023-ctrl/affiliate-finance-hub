
-- Corrigir a função lock_wallet_balance para não usar FOR UPDATE com LEFT JOIN
CREATE OR REPLACE FUNCTION public.lock_wallet_balance(
    p_wallet_id uuid, 
    p_valor_usd numeric, 
    p_ledger_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_current_locked NUMERIC;
    v_saldo_total NUMERIC;
    v_saldo_disponivel NUMERIC;
    v_wallet_exists BOOLEAN;
BEGIN
    -- Primeiro, travar a linha da wallet (sem JOIN)
    SELECT 
        COALESCE(balance_locked, 0),
        TRUE
    INTO v_current_locked, v_wallet_exists
    FROM wallets_crypto
    WHERE id = p_wallet_id
    FOR UPDATE;
    
    -- Verificar se wallet existe
    IF NOT v_wallet_exists THEN
        RETURN json_build_object(
            'success', false,
            'error', 'WALLET_NOT_FOUND'
        );
    END IF;
    
    -- Buscar saldo da view separadamente (sem FOR UPDATE)
    SELECT COALESCE(saldo_usd, 0)
    INTO v_saldo_total
    FROM v_saldo_parceiro_wallets
    WHERE wallet_id = p_wallet_id;
    
    -- Calcular saldo disponível
    v_saldo_disponivel := COALESCE(v_saldo_total, 0) - v_current_locked;
    
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
        balance_locked = v_current_locked + p_valor_usd,
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
$function$;
