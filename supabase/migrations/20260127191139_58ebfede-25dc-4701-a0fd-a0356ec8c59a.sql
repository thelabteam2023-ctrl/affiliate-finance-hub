
-- Criar função para destravar saldo diretamente (sem ledger_id)
-- Usada quando o insert do ledger falha após o lock

CREATE OR REPLACE FUNCTION public.unlock_wallet_balance(
  p_wallet_id UUID,
  p_valor_usd NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_locked NUMERIC;
  v_new_locked NUMERIC;
BEGIN
  -- Obter lock atual
  SELECT balance_locked INTO v_current_locked
  FROM wallets_crypto
  WHERE id = p_wallet_id
  FOR UPDATE;
  
  IF v_current_locked IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'WALLET_NOT_FOUND'
    );
  END IF;
  
  -- Calcular novo locked (nunca ficar negativo)
  v_new_locked := GREATEST(0, v_current_locked - p_valor_usd);
  
  -- Atualizar balance_locked
  UPDATE wallets_crypto
  SET 
    balance_locked = v_new_locked,
    updated_at = now()
  WHERE id = p_wallet_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'unlocked_amount', p_valor_usd,
    'previous_locked', v_current_locked,
    'new_locked_total', v_new_locked
  );
END;
$$;

COMMENT ON FUNCTION unlock_wallet_balance IS 'Destrava saldo de wallet diretamente. Usado para reverter lock quando insert no ledger falha.';
