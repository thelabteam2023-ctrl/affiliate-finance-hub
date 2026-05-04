-- Add aposta_id to bookmaker_stake_reservations
ALTER TABLE public.bookmaker_stake_reservations
ADD COLUMN aposta_id UUID;

-- Update get_saldo_disponivel_com_reservas to support ignoring a specific bet's stake
CREATE OR REPLACE FUNCTION public.get_saldo_disponivel_com_reservas(
  p_bookmaker_id uuid, 
  p_exclude_session_id character varying DEFAULT NULL::character varying,
  p_ignore_aposta_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(saldo_contabil numeric, saldo_reservado numeric, saldo_disponivel numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo_real NUMERIC;
  v_saldo_freebet NUMERIC;
  v_saldo_bonus NUMERIC;
  v_saldo_em_aposta NUMERIC;
  v_saldo_reservado NUMERIC;
BEGIN
  -- Limpar expiradas primeiro
  PERFORM public.cleanup_expired_reservations();
  
  -- Buscar saldo base da bookmaker
  SELECT 
    COALESCE(b.saldo_atual, 0),
    COALESCE(b.saldo_freebet, 0)
  INTO v_saldo_real, v_saldo_freebet
  FROM public.bookmakers b
  WHERE b.id = p_bookmaker_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  
  -- Calcular saldo em aposta (stakes pendentes)
  -- Ignorando a p_ignore_aposta_id se fornecida
  SELECT COALESCE(SUM(
    CASE 
      WHEN a.estrategia = 'ARBITRAGEM' THEN 0 -- Pernas são calculadas separadamente
      ELSE COALESCE(a.stake, 0)
    END
  ), 0)
  INTO v_saldo_em_aposta
  FROM public.apostas_unificada a
  WHERE a.bookmaker_id = p_bookmaker_id
    AND a.status = 'PENDENTE'
    AND (p_ignore_aposta_id IS NULL OR a.id != p_ignore_aposta_id);
  
  -- Adicionar stakes das pernas para arbitragens
  -- Ignorando a p_ignore_aposta_id se for uma perna
  SELECT v_saldo_em_aposta + COALESCE(SUM(ap.stake), 0)
  INTO v_saldo_em_aposta
  FROM public.apostas_pernas ap
  JOIN public.apostas_unificada a ON a.id = ap.aposta_id
  WHERE ap.bookmaker_id = p_bookmaker_id
    AND a.status = 'PENDENTE'
    AND a.estrategia = 'ARBITRAGEM'
    AND (p_ignore_aposta_id IS NULL OR ap.id != p_ignore_aposta_id);
  
  -- Calcular bônus creditados
  SELECT COALESCE(SUM(pblb.saldo_atual), 0)
  INTO v_saldo_bonus
  FROM public.project_bookmaker_link_bonuses pblb
  JOIN public.bookmakers b ON b.id = pblb.bookmaker_id
  WHERE pblb.bookmaker_id = p_bookmaker_id
    AND pblb.status = 'credited';
  
  -- Calcular reservas ativas (excluindo a sessão atual se fornecida)
  SELECT COALESCE(SUM(r.stake), 0)
  INTO v_saldo_reservado
  FROM public.bookmaker_stake_reservations r
  WHERE r.bookmaker_id = p_bookmaker_id
    AND r.status = 'active'
    AND (p_exclude_session_id IS NULL OR r.form_session_id != p_exclude_session_id);
  
  -- Saldo contábil = real + freebet + bonus - em_aposta
  -- Saldo disponível = contábil - reservado
  RETURN QUERY SELECT 
    (v_saldo_real + v_saldo_freebet + v_saldo_bonus - v_saldo_em_aposta)::NUMERIC AS saldo_contabil,
    v_saldo_reservado::NUMERIC AS saldo_reservado,
    (v_saldo_real + v_saldo_freebet + v_saldo_bonus - v_saldo_em_aposta - v_saldo_reservado)::NUMERIC AS saldo_disponivel;
END;
$function$;

-- Update upsert_stake_reservation to accept p_aposta_id
CREATE OR REPLACE FUNCTION public.upsert_stake_reservation(
  p_bookmaker_id uuid, 
  p_workspace_id uuid, 
  p_stake numeric, 
  p_moeda character varying DEFAULT 'BRL'::character varying, 
  p_form_session_id character varying DEFAULT NULL::character varying, 
  p_form_type character varying DEFAULT 'SIMPLES'::character varying,
  p_aposta_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(reservation_id uuid, success boolean, error_code character varying, error_message text, saldo_contabil numeric, saldo_reservado numeric, saldo_disponivel numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT * INTO v_saldo FROM public.get_saldo_disponivel_com_reservas(p_bookmaker_id, NULL, p_aposta_id);
    
    RETURN QUERY SELECT 
      NULL::UUID, TRUE, NULL::VARCHAR, NULL::TEXT,
      v_saldo.saldo_contabil, v_saldo.saldo_reservado, v_saldo.saldo_disponivel;
    RETURN;
  END IF;
  
  -- Verificar saldo disponível (excluindo reserva atual da mesma sessão E ignorando a stake da aposta sendo editada)
  SELECT * INTO v_saldo FROM public.get_saldo_disponivel_com_reservas(p_bookmaker_id, p_form_session_id, p_aposta_id);
  
  IF v_saldo.saldo_disponivel < p_stake THEN
    RETURN QUERY SELECT 
      NULL::UUID, FALSE, 'SALDO_INSUFICIENTE'::VARCHAR,
      format('Saldo disponível: %s, Stake solicitado: %s', 
        v_saldo.saldo_disponivel::TEXT, p_stake::TEXT)::TEXT,
      v_saldo.saldo_contabil, v_saldo.saldo_reservado, v_saldo.saldo_disponivel;
    RETURN;
  END IF;
  
  -- Tentar atualizar reserva existente (TTL 25 segundos)
  UPDATE public.bookmaker_stake_reservations
  SET 
    stake = p_stake,
    moeda = p_moeda,
    aposta_id = p_aposta_id,
    expires_at = now() + INTERVAL '25 seconds',
    updated_at = now()
  WHERE form_session_id = p_form_session_id
    AND bookmaker_id = p_bookmaker_id
    AND status = 'active'
  RETURNING id INTO v_reservation_id;
  
  -- Se não existe, criar nova (TTL 25 segundos)
  IF v_reservation_id IS NULL THEN
    -- Cancelar reservas antigas da mesma sessão para outras bookmakers
    UPDATE public.bookmaker_stake_reservations
    SET status = 'cancelled', updated_at = now()
    WHERE form_session_id = p_form_session_id
      AND status = 'active';
    
    INSERT INTO public.bookmaker_stake_reservations (
      bookmaker_id, user_id, workspace_id, stake, moeda, 
      form_session_id, form_type, expires_at, aposta_id
    ) VALUES (
      p_bookmaker_id, v_user_id, p_workspace_id, p_stake, p_moeda,
      p_form_session_id, p_form_type, now() + INTERVAL '25 seconds', p_aposta_id
    )
    RETURNING id INTO v_reservation_id;
  END IF;
  
  -- Recalcular saldos após reserva
  SELECT * INTO v_saldo FROM public.get_saldo_disponivel_com_reservas(p_bookmaker_id, NULL, p_aposta_id);
  
  RETURN QUERY SELECT 
    v_reservation_id, TRUE, NULL::VARCHAR, NULL::TEXT,
    v_saldo.saldo_contabil, v_saldo.saldo_reservado, v_saldo.saldo_disponivel;
END;
$function$;
