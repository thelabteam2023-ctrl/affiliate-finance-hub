-- Tabela para rastrear tentativas de login (proteção brute force)
CREATE TABLE public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT false,
  blocked_until TIMESTAMPTZ
);

-- Índice para busca rápida por email
CREATE INDEX idx_login_attempts_email ON public.login_attempts(email);
CREATE INDEX idx_login_attempts_attempted_at ON public.login_attempts(attempted_at);

-- Função para verificar se conta está bloqueada (5 tentativas em 15 min = bloqueio de 15 min)
CREATE OR REPLACE FUNCTION public.check_login_blocked(p_email TEXT)
RETURNS TABLE(is_blocked BOOLEAN, blocked_until TIMESTAMPTZ, failed_attempts INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed_count INT;
  v_blocked_until TIMESTAMPTZ;
BEGIN
  -- Contar tentativas falhas nos últimos 15 minutos
  SELECT COUNT(*) INTO v_failed_count
  FROM login_attempts
  WHERE email = LOWER(p_email)
    AND success = false
    AND attempted_at > now() - interval '15 minutes';
  
  -- Se 5+ tentativas, calcular bloqueio
  IF v_failed_count >= 5 THEN
    SELECT MAX(attempted_at) + interval '15 minutes' INTO v_blocked_until
    FROM login_attempts
    WHERE email = LOWER(p_email)
      AND success = false
      AND attempted_at > now() - interval '15 minutes';
    
    IF v_blocked_until > now() THEN
      RETURN QUERY SELECT true, v_blocked_until, v_failed_count;
      RETURN;
    END IF;
  END IF;
  
  RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, v_failed_count;
END;
$$;

-- Função para registrar tentativa de login
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_email TEXT,
  p_success BOOLEAN,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO login_attempts (email, success, ip_address)
  VALUES (LOWER(p_email), p_success, p_ip_address);
  
  -- Se login bem-sucedido, limpar tentativas antigas desse email
  IF p_success THEN
    DELETE FROM login_attempts
    WHERE email = LOWER(p_email)
      AND success = false;
  END IF;
  
  -- Limpar tentativas muito antigas (mais de 24h) para manter tabela limpa
  DELETE FROM login_attempts
  WHERE attempted_at < now() - interval '24 hours';
END;
$$;

-- Adicionar coluna na audit_logs para eventos de segurança se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'audit_action' 
    AND 'login_failed' = ANY(enum_range(NULL::audit_action)::text[])
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'login_failed';
    ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'login_success';
    ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'login_blocked';
    ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'password_reset_requested';
  END IF;
END $$;

-- RLS para login_attempts (apenas funções security definer acessam)
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Política: ninguém acessa diretamente (apenas via funções security definer)
CREATE POLICY "No direct access to login_attempts"
ON public.login_attempts
FOR ALL
USING (false);

-- Permitir que as funções security definer funcionem
GRANT SELECT, INSERT, DELETE ON public.login_attempts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.login_attempts TO anon;