
-- =====================================================
-- RBAC MIGRATION PART 2: TABLES, FUNCTIONS, POLICIES
-- =====================================================

-- 1. WORKSPACES TABLE
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'advanced')),
  max_active_partners INTEGER NOT NULL DEFAULT 3,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- 2. WORKSPACE MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON public.workspace_members(workspace_id);

-- 3. PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'project_only', 'self_only')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. ROLE PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role, permission_code)
);

-- 5. USER PERMISSION OVERRIDES
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE(workspace_id, user_id, permission_code)
);
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- 6. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id),
  actor_user_id UUID NOT NULL,
  action public.audit_action NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_name TEXT,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON public.audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- 7. BOOKMAKER WORKSPACE ACCESS
CREATE TABLE IF NOT EXISTS public.bookmaker_workspace_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmaker_catalogo_id UUID NOT NULL REFERENCES public.bookmakers_catalogo(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(bookmaker_catalogo_id, workspace_id)
);
ALTER TABLE public.bookmaker_workspace_access ENABLE ROW LEVEL SECURITY;

-- 8. MODIFY EXISTING TABLES
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS first_operation_at TIMESTAMPTZ;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.parceiros ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.bookmakers ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.investidores ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.operadores ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.operadores ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.cash_ledger ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.despesas_administrativas ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.indicadores_referral ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.parcerias ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);

-- Add visibility to bookmakers_catalogo
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookmakers_catalogo' AND column_name = 'visibility') THEN
    ALTER TABLE public.bookmakers_catalogo ADD COLUMN visibility public.bookmaker_visibility DEFAULT 'GLOBAL_REGULATED';
  END IF;
END $$;

-- Add cancellation fields to apostas
ALTER TABLE public.apostas ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.apostas ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);
ALTER TABLE public.apostas ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE public.apostas_multiplas ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.apostas_multiplas ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);
ALTER TABLE public.apostas_multiplas ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projetos_workspace ON public.projetos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_workspace ON public.parceiros(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bookmakers_workspace ON public.bookmakers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_operadores_workspace ON public.operadores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_workspace ON public.cash_ledger(workspace_id);

-- 9. SECURITY DEFINER FUNCTIONS

CREATE OR REPLACE FUNCTION public.get_user_workspace(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT workspace_id FROM public.workspace_members WHERE user_id = _user_id AND is_active = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID, _workspace_id UUID DEFAULT NULL)
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.workspace_members
  WHERE user_id = _user_id AND workspace_id = COALESCE(_workspace_id, public.get_user_workspace(_user_id)) AND is_active = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_code TEXT, _workspace_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_role public.app_role;
  v_override_granted BOOLEAN;
BEGIN
  v_workspace_id := COALESCE(_workspace_id, public.get_user_workspace(_user_id));
  IF v_workspace_id IS NULL THEN RETURN FALSE; END IF;
  v_role := public.get_user_role(_user_id, v_workspace_id);
  IF v_role IS NULL THEN RETURN FALSE; END IF;
  IF v_role IN ('owner', 'master') THEN RETURN TRUE; END IF;
  SELECT granted INTO v_override_granted FROM public.user_permission_overrides
  WHERE workspace_id = v_workspace_id AND user_id = _user_id AND permission_code = _permission_code
    AND (expires_at IS NULL OR expires_at > now());
  IF FOUND THEN RETURN v_override_granted; END IF;
  RETURN EXISTS (SELECT 1 FROM public.role_permissions WHERE role = v_role AND permission_code = _permission_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.operator_has_project_access(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.operador_projetos op
    JOIN public.operadores o ON op.operador_id = o.id
    WHERE o.auth_user_id = _user_id AND op.projeto_id = _project_id AND op.status = 'ATIVO'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_owner_or_admin(_user_id UUID, _workspace_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.get_user_role(_user_id, _workspace_id) IN ('owner', 'admin', 'master')
$$;

CREATE OR REPLACE FUNCTION public.create_audit_log(
  _action public.audit_action,
  _entity_type TEXT,
  _entity_id UUID DEFAULT NULL,
  _entity_name TEXT DEFAULT NULL,
  _before_data JSONB DEFAULT NULL,
  _after_data JSONB DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (workspace_id, actor_user_id, action, entity_type, entity_id, entity_name, before_data, after_data, metadata)
  VALUES (public.get_user_workspace(auth.uid()), auth.uid(), _action, _entity_type, _entity_id, _entity_name, _before_data, _after_data, _metadata)
  RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;

-- 10. RLS POLICIES
DROP POLICY IF EXISTS "Members can view their workspace" ON public.workspaces;
CREATE POLICY "Members can view their workspace" ON public.workspaces FOR SELECT
USING (id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND is_active = true));

DROP POLICY IF EXISTS "Owner/Admin can update workspace" ON public.workspaces;
CREATE POLICY "Owner/Admin can update workspace" ON public.workspaces FOR UPDATE
USING (public.is_owner_or_admin(auth.uid(), id));

DROP POLICY IF EXISTS "View workspace members" ON public.workspace_members;
CREATE POLICY "View workspace members" ON public.workspace_members FOR SELECT
USING (workspace_id = public.get_user_workspace(auth.uid()));

DROP POLICY IF EXISTS "Owner/Admin manage members" ON public.workspace_members;
CREATE POLICY "Owner/Admin manage members" ON public.workspace_members FOR ALL
USING (public.is_owner_or_admin(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "View own permission overrides" ON public.user_permission_overrides;
CREATE POLICY "View own permission overrides" ON public.user_permission_overrides FOR SELECT
USING (user_id = auth.uid() OR public.is_owner_or_admin(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Owner/Admin manage overrides" ON public.user_permission_overrides;
CREATE POLICY "Owner/Admin manage overrides" ON public.user_permission_overrides FOR ALL
USING (public.is_owner_or_admin(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Owner/Admin view audit logs" ON public.audit_logs;
CREATE POLICY "Owner/Admin view audit logs" ON public.audit_logs FOR SELECT
USING (public.is_owner_or_admin(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Insert audit logs" ON public.audit_logs;
CREATE POLICY "Insert audit logs" ON public.audit_logs FOR INSERT
WITH CHECK (actor_user_id = auth.uid());

DROP POLICY IF EXISTS "View bookmaker access" ON public.bookmaker_workspace_access;
CREATE POLICY "View bookmaker access" ON public.bookmaker_workspace_access FOR SELECT
USING (workspace_id = public.get_user_workspace(auth.uid()));

DROP POLICY IF EXISTS "System admin manage access" ON public.bookmaker_workspace_access;
CREATE POLICY "System admin manage access" ON public.bookmaker_workspace_access FOR ALL
USING (public.is_owner_or_admin(auth.uid(), workspace_id));
