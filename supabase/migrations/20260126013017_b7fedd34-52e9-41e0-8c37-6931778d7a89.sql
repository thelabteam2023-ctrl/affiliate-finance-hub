-- Atualizar função upsert_stake_reservation com timeout de 2 minutos
CREATE OR REPLACE FUNCTION public.upsert_stake_reservation(
  p_bookmaker_id UUID,
  p_workspace_id UUID,
  p_stake NUMERIC,
  p_moeda VARCHAR DEFAULT 'BRL',
  p_form_session_id VARCHAR DEFAULT NULL,
  p_form_type VARCHAR DEFAULT 'SIMPLES'
)
RETURNS TABLE (
  reservation_id UUID,
  success BOOLEAN,
  error_code VARCHAR,
  error_message TEXT,
  saldo_contabil NUMERIC,
  saldo_reservado NUMERIC,
  saldo_disponivel NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id UUID;
  v_reservation_id UUID;
  v_saldo RECORD;
BEGIN
  -- Identificar usuário
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 
      NULL::UUID, FALSE, 'AUTH_REQUIRED'::VARCHAR, 
      'Usuário não autenticado'::TEXT,
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  
  -- Limpar reservas expiradas
  PERFORM public.cleanup_expired_reservations();
  
  -- Se stake é 0 ou negativo, cancelar reserva existente
  IF p_stake <= 0 THEN
    UPDATE public.bookmaker_stake_reservations
    SET status = 'cancelled', updated_at = now()
    WHERE form_session_id = p_form_session_id
      AND bookmaker_id = p_bookmaker_id
      AND status = 'active';
    
    -- Retornar saldos atualizados
    SELECT * INTO v_saldo FROM public.get_saldo_disponivel_com_reservas(p_bookmaker_id, NULL);
    
    RETURN QUERY SELECT 
      NULL::UUID, TRUE, NULL::VARCHAR, NULL::TEXT,
      v_saldo.saldo_contabil, v_saldo.saldo_reservado, v_saldo.saldo_disponivel;
    RETURN;
  END IF;
  
  -- Verificar saldo disponível (excluindo reserva atual da mesma sessão)
  SELECT * INTO v_saldo FROM public.get_saldo_disponivel_com_reservas(p_bookmaker_id, p_form_session_id);
  
  IF v_saldo.saldo_disponivel < p_stake THEN
    RETURN QUERY SELECT 
      NULL::UUID, FALSE, 'SALDO_INSUFICIENTE'::VARCHAR,
      format('Saldo disponível: %s, Stake solicitado: %s', 
        v_saldo.saldo_disponivel::TEXT, p_stake::TEXT)::TEXT,
      v_saldo.saldo_contabil, v_saldo.saldo_reservado, v_saldo.saldo_disponivel;
    RETURN;
  END IF;
  
  -- Tentar atualizar reserva existente (agora com 2 minutos)
  UPDATE public.bookmaker_stake_reservations
  SET 
    stake = p_stake,
    moeda = p_moeda,
    expires_at = now() + INTERVAL '2 minutes',
    updated_at = now()
  WHERE form_session_id = p_form_session_id
    AND bookmaker_id = p_bookmaker_id
    AND status = 'active'
  RETURNING id INTO v_reservation_id;
  
  -- Se não existe, criar nova (agora com 2 minutos)
  IF v_reservation_id IS NULL THEN
    -- Cancelar reservas antigas da mesma sessão para outras bookmakers
    UPDATE public.bookmaker_stake_reservations
    SET status = 'cancelled', updated_at = now()
    WHERE form_session_id = p_form_session_id
      AND status = 'active';
    
    INSERT INTO public.bookmaker_stake_reservations (
      bookmaker_id, user_id, workspace_id, stake, moeda, 
      form_session_id, form_type, expires_at
    ) VALUES (
      p_bookmaker_id, v_user_id, p_workspace_id, p_stake, p_moeda,
      p_form_session_id, p_form_type, now() + INTERVAL '2 minutes'
    )
    RETURNING id INTO v_reservation_id;
  END IF;
  
  -- Retornar saldos atualizados
  SELECT * INTO v_saldo FROM public.get_saldo_disponivel_com_reservas(p_bookmaker_id, NULL);
  
  RETURN QUERY SELECT 
    v_reservation_id, TRUE, NULL::VARCHAR, NULL::TEXT,
    v_saldo.saldo_contabil, v_saldo.saldo_reservado, v_saldo.saldo_disponivel;
END;
$$;

-- Também atualizar o default da coluna expires_at
ALTER TABLE public.bookmaker_stake_reservations 
ALTER COLUMN expires_at SET DEFAULT now() + INTERVAL '2 minutes';