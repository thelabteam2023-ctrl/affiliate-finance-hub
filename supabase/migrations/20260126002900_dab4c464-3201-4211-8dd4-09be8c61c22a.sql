-- ==============================================================================
-- SISTEMA DE RESERVA DE SALDO EM TEMPO REAL
-- Elimina race conditions entre operadores simultâneos
-- ==============================================================================

-- 1. TABELA DE RESERVAS TEMPORÁRIAS
CREATE TABLE public.bookmaker_stake_reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stake NUMERIC NOT NULL CHECK (stake > 0),
  moeda VARCHAR(10) NOT NULL DEFAULT 'BRL',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'committed', 'cancelled', 'expired')),
  form_session_id VARCHAR(100) NOT NULL, -- Identificador único da sessão do formulário
  form_type VARCHAR(30) NOT NULL CHECK (form_type IN ('SIMPLES', 'MULTIPLA', 'SUREBET')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. ÍNDICES PARA PERFORMANCE
CREATE INDEX idx_reservations_bookmaker_active ON public.bookmaker_stake_reservations(bookmaker_id) 
  WHERE status = 'active';
CREATE INDEX idx_reservations_expires ON public.bookmaker_stake_reservations(expires_at) 
  WHERE status = 'active';
CREATE INDEX idx_reservations_session ON public.bookmaker_stake_reservations(form_session_id);
CREATE INDEX idx_reservations_workspace ON public.bookmaker_stake_reservations(workspace_id);

-- 3. HABILITAR RLS
ALTER TABLE public.bookmaker_stake_reservations ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS RLS
CREATE POLICY "Users can view reservations in their workspace"
ON public.bookmaker_stake_reservations
FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members 
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

CREATE POLICY "Users can create reservations in their workspace"
ON public.bookmaker_stake_reservations
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members 
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

CREATE POLICY "Users can update their own reservations"
ON public.bookmaker_stake_reservations
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own reservations"
ON public.bookmaker_stake_reservations
FOR DELETE
USING (user_id = auth.uid());

-- 5. TRIGGER PARA UPDATED_AT
CREATE TRIGGER update_reservations_updated_at
BEFORE UPDATE ON public.bookmaker_stake_reservations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 6. HABILITAR REALTIME PARA SINCRONIZAÇÃO
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookmaker_stake_reservations;

-- 7. FUNÇÃO PARA LIMPAR RESERVAS EXPIRADAS
CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE public.bookmaker_stake_reservations
  SET status = 'expired', updated_at = now()
  WHERE status = 'active' AND expires_at < now();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  RETURN expired_count;
END;
$$;

-- 8. FUNÇÃO PARA OBTER SALDO DISPONÍVEL COM RESERVAS
CREATE OR REPLACE FUNCTION public.get_saldo_disponivel_com_reservas(
  p_bookmaker_id UUID,
  p_exclude_session_id VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  saldo_contabil NUMERIC,
  saldo_reservado NUMERIC,
  saldo_disponivel NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
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
  SELECT COALESCE(SUM(
    CASE 
      WHEN a.estrategia = 'ARBITRAGEM' THEN 0 -- Pernas são calculadas separadamente
      ELSE COALESCE(a.stake, 0)
    END
  ), 0)
  INTO v_saldo_em_aposta
  FROM public.apostas_unificada a
  WHERE a.bookmaker_id = p_bookmaker_id
    AND a.status = 'PENDENTE';
  
  -- Adicionar stakes das pernas para arbitragens
  SELECT v_saldo_em_aposta + COALESCE(SUM(ap.stake), 0)
  INTO v_saldo_em_aposta
  FROM public.apostas_pernas ap
  JOIN public.apostas_unificada a ON a.id = ap.aposta_id
  WHERE ap.bookmaker_id = p_bookmaker_id
    AND a.status = 'PENDENTE'
    AND a.estrategia = 'ARBITRAGEM';
  
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
$$;

-- 9. FUNÇÃO PARA CRIAR/ATUALIZAR RESERVA (UPSERT)
CREATE OR REPLACE FUNCTION public.upsert_stake_reservation(
  p_bookmaker_id UUID,
  p_workspace_id UUID,
  p_stake NUMERIC,
  p_moeda VARCHAR,
  p_form_session_id VARCHAR,
  p_form_type VARCHAR
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
  
  -- Tentar atualizar reserva existente
  UPDATE public.bookmaker_stake_reservations
  SET 
    stake = p_stake,
    moeda = p_moeda,
    expires_at = now() + INTERVAL '10 minutes',
    updated_at = now()
  WHERE form_session_id = p_form_session_id
    AND bookmaker_id = p_bookmaker_id
    AND status = 'active'
  RETURNING id INTO v_reservation_id;
  
  -- Se não existe, criar nova
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
      p_form_session_id, p_form_type, now() + INTERVAL '10 minutes'
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

-- 10. FUNÇÃO PARA COMMITAR RESERVA (Quando aposta é salva)
CREATE OR REPLACE FUNCTION public.commit_stake_reservation(
  p_form_session_id VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.bookmaker_stake_reservations
  SET status = 'committed', updated_at = now()
  WHERE form_session_id = p_form_session_id
    AND status = 'active';
  
  RETURN FOUND;
END;
$$;

-- 11. FUNÇÃO PARA CANCELAR RESERVA (Quando formulário é fechado)
CREATE OR REPLACE FUNCTION public.cancel_stake_reservation(
  p_form_session_id VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.bookmaker_stake_reservations
  SET status = 'cancelled', updated_at = now()
  WHERE form_session_id = p_form_session_id
    AND status = 'active';
  
  RETURN FOUND;
END;
$$;