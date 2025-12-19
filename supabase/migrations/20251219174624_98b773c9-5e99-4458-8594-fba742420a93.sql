-- ==============================================
-- FASE 1: INFRAESTRUTURA DE CONVITES
-- ==============================================

-- 1. Criar tabela workspace_invites
CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'canceled')),
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '72 hours'),
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  invited_user_id UUID REFERENCES auth.users(id) -- Preenchido quando o usuário aceitar
);

-- Índice único para apenas 1 convite pendente por email/workspace
CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_invite 
ON public.workspace_invites (workspace_id, LOWER(email))
WHERE status = 'pending';

-- Índice para buscar por token
CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON public.workspace_invites(token);

-- Índice para buscar convites por email
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON public.workspace_invites(LOWER(email));

-- Enable RLS
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies para workspace_invites
-- Owners/admins podem ver convites do seu workspace
CREATE POLICY "Workspace admins can view invites"
ON public.workspace_invites
FOR SELECT
USING (
  public.is_owner_or_admin(auth.uid(), workspace_id)
  OR LOWER(email) = LOWER((SELECT email FROM public.profiles WHERE id = auth.uid()))
);

-- Owners/admins podem criar convites
CREATE POLICY "Workspace admins can create invites"
ON public.workspace_invites
FOR INSERT
WITH CHECK (
  public.is_owner_or_admin(auth.uid(), workspace_id)
);

-- Owners/admins podem atualizar convites (cancelar/reenviar)
CREATE POLICY "Workspace admins can update invites"
ON public.workspace_invites
FOR UPDATE
USING (
  public.is_owner_or_admin(auth.uid(), workspace_id)
  OR LOWER(email) = LOWER((SELECT email FROM public.profiles WHERE id = auth.uid()))
);

-- ==============================================
-- FASE 2: MULTI-WORKSPACE BACKEND
-- ==============================================

-- 2. Adicionar coluna default_workspace_id em profiles (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'default_workspace_id'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN default_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Criar função get_user_workspaces (plural) - retorna TODOS os workspaces do usuário
CREATE OR REPLACE FUNCTION public.get_user_workspaces(_user_id uuid)
RETURNS TABLE(
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  role public.app_role,
  plan text,
  is_default boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_default_ws_id UUID;
BEGIN
  -- Obter default workspace do usuário
  SELECT p.default_workspace_id INTO v_default_ws_id
  FROM profiles p
  WHERE p.id = _user_id;

  RETURN QUERY
  SELECT 
    w.id as workspace_id,
    w.name as workspace_name,
    w.slug as workspace_slug,
    wm.role,
    w.plan,
    (w.id = v_default_ws_id OR (v_default_ws_id IS NULL AND wm.role = 'owner')) as is_default
  FROM workspace_members wm
  INNER JOIN workspaces w ON w.id = wm.workspace_id
  WHERE wm.user_id = _user_id
    AND wm.is_active = true
    AND COALESCE(w.is_active, true) = true
  ORDER BY 
    (w.id = v_default_ws_id) DESC,  -- Default primeiro
    (wm.role = 'owner') DESC,       -- Depois os que é owner
    w.name ASC;                      -- Depois por nome
END;
$$;

-- 4. Criar função set_current_workspace para trocar de workspace
CREATE OR REPLACE FUNCTION public.set_current_workspace(_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_member BOOLEAN;
BEGIN
  -- Verificar se usuário é membro do workspace
  SELECT EXISTS(
    SELECT 1 FROM workspace_members
    WHERE user_id = v_user_id
      AND workspace_id = _workspace_id
      AND is_active = true
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Usuário não é membro deste workspace';
  END IF;

  -- Atualizar default_workspace_id
  UPDATE profiles
  SET default_workspace_id = _workspace_id
  WHERE id = v_user_id;

  RETURN true;
END;
$$;

-- ==============================================
-- FUNÇÕES RPC PARA CONVITES
-- ==============================================

-- 5. Função para criar convite
CREATE OR REPLACE FUNCTION public.create_workspace_invite(
  _email text,
  _workspace_id uuid,
  _role public.app_role DEFAULT 'viewer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invite_id UUID;
  v_token UUID;
  v_existing_invite_id UUID;
  v_existing_member_id UUID;
  v_workspace_name TEXT;
  v_inviter_name TEXT;
  v_normalized_email TEXT;
BEGIN
  v_normalized_email := LOWER(TRIM(_email));

  -- Validar email
  IF v_normalized_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email inválido');
  END IF;

  -- Verificar permissão do caller
  IF NOT public.is_owner_or_admin(auth.uid(), _workspace_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para convidar membros');
  END IF;

  -- Buscar nome do workspace
  SELECT name INTO v_workspace_name FROM workspaces WHERE id = _workspace_id;

  -- Buscar nome do convidador
  SELECT COALESCE(full_name, email) INTO v_inviter_name 
  FROM profiles WHERE id = auth.uid();

  -- Verificar se já é membro ativo
  SELECT wm.id INTO v_existing_member_id
  FROM workspace_members wm
  INNER JOIN profiles p ON p.id = wm.user_id
  WHERE LOWER(p.email) = v_normalized_email
    AND wm.workspace_id = _workspace_id
    AND wm.is_active = true;

  IF v_existing_member_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Este usuário já é membro do workspace',
      'already_member', true
    );
  END IF;

  -- Verificar se já existe convite pendente
  SELECT id INTO v_existing_invite_id
  FROM workspace_invites
  WHERE LOWER(email) = v_normalized_email
    AND workspace_id = _workspace_id
    AND status = 'pending';

  IF v_existing_invite_id IS NOT NULL THEN
    -- Atualizar convite existente (renovar token e expiração)
    UPDATE workspace_invites
    SET 
      token = gen_random_uuid(),
      expires_at = now() + interval '72 hours',
      role = _role,
      created_by = auth.uid()
    WHERE id = v_existing_invite_id
    RETURNING id, token INTO v_invite_id, v_token;

    RETURN jsonb_build_object(
      'success', true, 
      'invite_id', v_invite_id,
      'token', v_token,
      'renewed', true,
      'workspace_name', v_workspace_name,
      'inviter_name', v_inviter_name,
      'email', v_normalized_email,
      'role', _role
    );
  END IF;

  -- Criar novo convite
  INSERT INTO workspace_invites (
    workspace_id, 
    email, 
    role, 
    created_by,
    token,
    expires_at
  )
  VALUES (
    _workspace_id, 
    v_normalized_email, 
    _role, 
    auth.uid(),
    gen_random_uuid(),
    now() + interval '72 hours'
  )
  RETURNING id, token INTO v_invite_id, v_token;

  RETURN jsonb_build_object(
    'success', true, 
    'invite_id', v_invite_id,
    'token', v_token,
    'renewed', false,
    'workspace_name', v_workspace_name,
    'inviter_name', v_inviter_name,
    'email', v_normalized_email,
    'role', _role
  );
END;
$$;

-- 6. Função para aceitar convite (chamada pelo usuário convidado)
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID := auth.uid();
  v_user_email TEXT;
  v_existing_member_id UUID;
BEGIN
  -- Buscar email do usuário logado
  SELECT email INTO v_user_email FROM profiles WHERE id = v_user_id;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não encontrado');
  END IF;

  -- Buscar convite
  SELECT * INTO v_invite
  FROM workspace_invites
  WHERE token = _token;

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite não encontrado');
  END IF;

  -- Verificar se convite é para este email
  IF LOWER(v_invite.email) != LOWER(v_user_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este convite não é para você');
  END IF;

  -- Verificar status
  IF v_invite.status = 'accepted' THEN
    -- Já aceito - retornar sucesso silencioso (idempotente)
    RETURN jsonb_build_object(
      'success', true, 
      'already_accepted', true,
      'workspace_id', v_invite.workspace_id
    );
  END IF;

  IF v_invite.status = 'canceled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este convite foi cancelado');
  END IF;

  IF v_invite.status = 'expired' OR v_invite.expires_at < now() THEN
    -- Marcar como expirado se ainda não estiver
    UPDATE workspace_invites SET status = 'expired' WHERE id = v_invite.id AND status = 'pending';
    RETURN jsonb_build_object('success', false, 'error', 'Este convite expirou');
  END IF;

  -- Verificar se já é membro
  SELECT id INTO v_existing_member_id
  FROM workspace_members
  WHERE user_id = v_user_id
    AND workspace_id = v_invite.workspace_id;

  IF v_existing_member_id IS NOT NULL THEN
    -- Reativar membro se inativo
    UPDATE workspace_members
    SET is_active = true, role = v_invite.role
    WHERE id = v_existing_member_id;
  ELSE
    -- Adicionar como novo membro
    INSERT INTO workspace_members (workspace_id, user_id, role, is_active, joined_at)
    VALUES (v_invite.workspace_id, v_user_id, v_invite.role, true, now());
  END IF;

  -- Marcar convite como aceito
  UPDATE workspace_invites
  SET 
    status = 'accepted',
    accepted_at = now(),
    invited_user_id = v_user_id
  WHERE id = v_invite.id;

  -- Se usuário não tinha default workspace, definir este
  UPDATE profiles
  SET default_workspace_id = v_invite.workspace_id
  WHERE id = v_user_id AND default_workspace_id IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_invite.workspace_id,
    'role', v_invite.role
  );
END;
$$;

-- 7. Função para cancelar convite
CREATE OR REPLACE FUNCTION public.cancel_workspace_invite(_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invite RECORD;
BEGIN
  -- Buscar convite
  SELECT * INTO v_invite FROM workspace_invites WHERE id = _invite_id;

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite não encontrado');
  END IF;

  -- Verificar permissão
  IF NOT public.is_owner_or_admin(auth.uid(), v_invite.workspace_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;

  -- Verificar se pode cancelar
  IF v_invite.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas convites pendentes podem ser cancelados');
  END IF;

  -- Cancelar
  UPDATE workspace_invites
  SET status = 'canceled'
  WHERE id = _invite_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 8. Função para reenviar convite
CREATE OR REPLACE FUNCTION public.resend_workspace_invite(_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invite RECORD;
  v_new_token UUID;
  v_workspace_name TEXT;
  v_inviter_name TEXT;
BEGIN
  -- Buscar convite
  SELECT * INTO v_invite FROM workspace_invites WHERE id = _invite_id;

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite não encontrado');
  END IF;

  -- Verificar permissão
  IF NOT public.is_owner_or_admin(auth.uid(), v_invite.workspace_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;

  -- Verificar se pode reenviar (apenas pendentes ou expirados)
  IF v_invite.status NOT IN ('pending', 'expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este convite não pode ser reenviado');
  END IF;

  -- Gerar novo token e renovar expiração
  v_new_token := gen_random_uuid();
  
  UPDATE workspace_invites
  SET 
    token = v_new_token,
    expires_at = now() + interval '72 hours',
    status = 'pending',
    created_by = auth.uid()
  WHERE id = _invite_id;

  -- Buscar informações para email
  SELECT name INTO v_workspace_name FROM workspaces WHERE id = v_invite.workspace_id;
  SELECT COALESCE(full_name, email) INTO v_inviter_name FROM profiles WHERE id = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'invite_id', _invite_id,
    'token', v_new_token,
    'workspace_name', v_workspace_name,
    'inviter_name', v_inviter_name,
    'email', v_invite.email,
    'role', v_invite.role
  );
END;
$$;

-- 9. Função para buscar convites pendentes de um workspace
CREATE OR REPLACE FUNCTION public.get_workspace_invites(_workspace_id uuid)
RETURNS TABLE(
  id uuid,
  email text,
  role public.app_role,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  created_by_email text,
  created_by_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verificar permissão
  IF NOT public.is_owner_or_admin(auth.uid(), _workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão para ver convites';
  END IF;

  RETURN QUERY
  SELECT 
    wi.id,
    wi.email,
    wi.role,
    CASE 
      WHEN wi.status = 'pending' AND wi.expires_at < now() THEN 'expired'
      ELSE wi.status
    END as status,
    wi.expires_at,
    wi.created_at,
    p.email as created_by_email,
    p.full_name as created_by_name
  FROM workspace_invites wi
  LEFT JOIN profiles p ON p.id = wi.created_by
  WHERE wi.workspace_id = _workspace_id
  ORDER BY 
    CASE wi.status 
      WHEN 'pending' THEN 1 
      WHEN 'expired' THEN 2 
      ELSE 3 
    END,
    wi.created_at DESC;
END;
$$;

-- 10. Função para buscar convites pendentes do usuário logado (para mostrar ao criar conta)
CREATE OR REPLACE FUNCTION public.get_my_pending_invites()
RETURNS TABLE(
  id uuid,
  workspace_id uuid,
  workspace_name text,
  role public.app_role,
  token uuid,
  expires_at timestamptz,
  inviter_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_email TEXT;
BEGIN
  -- Buscar email do usuário logado
  SELECT email INTO v_user_email FROM profiles WHERE id = auth.uid();

  IF v_user_email IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    wi.id,
    wi.workspace_id,
    w.name as workspace_name,
    wi.role,
    wi.token,
    wi.expires_at,
    COALESCE(p.full_name, p.email) as inviter_name
  FROM workspace_invites wi
  INNER JOIN workspaces w ON w.id = wi.workspace_id
  LEFT JOIN profiles p ON p.id = wi.created_by
  WHERE LOWER(wi.email) = LOWER(v_user_email)
    AND wi.status = 'pending'
    AND wi.expires_at > now()
  ORDER BY wi.created_at DESC;
END;
$$;

-- 11. Função para verificar convite por token (pública, para página de aceite)
CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invite RECORD;
  v_workspace_name TEXT;
  v_inviter_name TEXT;
BEGIN
  SELECT * INTO v_invite FROM workspace_invites WHERE token = _token;

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('found', false, 'error', 'Convite não encontrado');
  END IF;

  -- Buscar informações extras
  SELECT name INTO v_workspace_name FROM workspaces WHERE id = v_invite.workspace_id;
  SELECT COALESCE(full_name, email) INTO v_inviter_name FROM profiles WHERE id = v_invite.created_by;

  -- Verificar status
  IF v_invite.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'found', true,
      'status', 'accepted',
      'workspace_name', v_workspace_name
    );
  END IF;

  IF v_invite.status = 'canceled' THEN
    RETURN jsonb_build_object('found', true, 'status', 'canceled');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('found', true, 'status', 'expired');
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'status', 'pending',
    'email', v_invite.email,
    'role', v_invite.role,
    'workspace_id', v_invite.workspace_id,
    'workspace_name', v_workspace_name,
    'inviter_name', v_inviter_name,
    'expires_at', v_invite.expires_at
  );
END;
$$;

-- 12. Job para expirar convites antigos (pode ser executado periodicamente)
CREATE OR REPLACE FUNCTION public.expire_old_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE workspace_invites
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;