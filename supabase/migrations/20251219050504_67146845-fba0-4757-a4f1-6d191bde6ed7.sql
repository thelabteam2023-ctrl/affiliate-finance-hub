
-- ============================================================
-- Sistema Completo de Assinaturas por Período
-- ============================================================

-- 1. Criar tipo ENUM para status da assinatura
CREATE TYPE public.subscription_status AS ENUM (
  'active',       -- Assinatura ativa e válida
  'trialing',     -- Período de trial
  'past_due',     -- Pagamento atrasado (futuro com gateway)
  'canceled',     -- Cancelada pelo usuário
  'expired',      -- Expirada (não renovada)
  'grace_period'  -- Período de carência após expiração
);

-- 2. Criar tipo ENUM para período de cobrança (adicionando semiannual)
CREATE TYPE public.billing_period AS ENUM (
  'monthly',      -- Mensal (1 mês)
  'semiannual',   -- Semestral (6 meses)
  'annual',       -- Anual (12 meses)
  'lifetime'      -- Vitalício (sem expiração)
);

-- 3. Criar tabela de assinaturas de workspace
CREATE TABLE public.workspace_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  price_id UUID REFERENCES public.plan_prices(id),
  
  -- Status da assinatura
  status public.subscription_status NOT NULL DEFAULT 'active',
  
  -- Datas importantes
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,  -- NULL para lifetime
  renews_at TIMESTAMPTZ,   -- Próxima renovação automática (futuro)
  canceled_at TIMESTAMPTZ, -- Quando foi cancelada
  
  -- Período atual
  current_period public.billing_period NOT NULL DEFAULT 'monthly',
  
  -- Flags de controle
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  
  -- Período de graça em dias (configurável)
  grace_period_days INTEGER NOT NULL DEFAULT 7,
  
  -- Auditoria
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Metadados extras (para gateway futuro)
  provider TEXT,                    -- stripe, etc
  provider_subscription_id TEXT,    -- ID da assinatura no provider
  provider_customer_id TEXT,        -- ID do cliente no provider
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Constraint: um workspace só pode ter uma assinatura ativa por vez
  CONSTRAINT unique_active_subscription UNIQUE (workspace_id)
);

-- 4. Criar tabela de eventos de billing (para auditoria e webhooks futuros)
CREATE TABLE public.billing_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.workspace_subscriptions(id) ON DELETE SET NULL,
  
  -- Tipo do evento
  event_type TEXT NOT NULL, -- invoice.paid, subscription.created, subscription.canceled, etc
  
  -- Provider info (para webhooks)
  provider TEXT,              -- stripe, manual, system
  provider_event_id TEXT,     -- ID único do evento no provider (idempotência)
  
  -- Dados do evento
  payload JSONB DEFAULT '{}'::jsonb,
  
  -- Valores envolvidos
  amount NUMERIC,
  currency TEXT DEFAULT 'BRL',
  
  -- Status do processamento
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Auditoria
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraint de idempotência: mesmo evento do provider não pode ser processado 2x
  CONSTRAINT unique_provider_event UNIQUE (provider, provider_event_id)
);

-- 5. Criar tabela de histórico de mudanças de plano
CREATE TABLE public.subscription_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.workspace_subscriptions(id) ON DELETE SET NULL,
  
  -- Plano anterior e novo
  from_plan_id UUID REFERENCES public.plans(id),
  to_plan_id UUID REFERENCES public.plans(id),
  from_price_id UUID REFERENCES public.plan_prices(id),
  to_price_id UUID REFERENCES public.plan_prices(id),
  
  -- Tipo de mudança
  change_type TEXT NOT NULL, -- upgrade, downgrade, renewal, cancellation, reactivation
  
  -- Quando efetiva
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for TIMESTAMPTZ, -- Para downgrades agendados
  
  -- Quem fez
  performed_by UUID REFERENCES auth.users(id),
  reason TEXT,
  
  -- Metadados
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Índices para performance
CREATE INDEX idx_workspace_subscriptions_workspace ON public.workspace_subscriptions(workspace_id);
CREATE INDEX idx_workspace_subscriptions_status ON public.workspace_subscriptions(status);
CREATE INDEX idx_workspace_subscriptions_expires_at ON public.workspace_subscriptions(expires_at);
CREATE INDEX idx_billing_events_workspace ON public.billing_events(workspace_id);
CREATE INDEX idx_billing_events_type ON public.billing_events(event_type);
CREATE INDEX idx_billing_events_created ON public.billing_events(created_at);
CREATE INDEX idx_subscription_changes_workspace ON public.subscription_changes(workspace_id);

-- 7. RLS Policies
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_changes ENABLE ROW LEVEL SECURITY;

-- Subscriptions: workspace members podem ver, owner/admin podem modificar
CREATE POLICY "View workspace subscription"
  ON public.workspace_subscriptions
  FOR SELECT
  USING (workspace_id = get_user_workspace(auth.uid()));

CREATE POLICY "Manage workspace subscription"
  ON public.workspace_subscriptions
  FOR ALL
  USING (is_owner_or_admin(auth.uid(), workspace_id));

-- System owners podem ver/editar todas assinaturas
CREATE POLICY "System owner full access subscriptions"
  ON public.workspace_subscriptions
  FOR ALL
  USING (is_system_owner(auth.uid()));

-- Billing Events: apenas owner/admin podem ver
CREATE POLICY "View billing events"
  ON public.billing_events
  FOR SELECT
  USING (is_owner_or_admin(auth.uid(), workspace_id) OR is_system_owner(auth.uid()));

CREATE POLICY "System owner manage billing events"
  ON public.billing_events
  FOR ALL
  USING (is_system_owner(auth.uid()));

-- Subscription Changes: apenas leitura para owner/admin
CREATE POLICY "View subscription changes"
  ON public.subscription_changes
  FOR SELECT
  USING (is_owner_or_admin(auth.uid(), workspace_id) OR is_system_owner(auth.uid()));

CREATE POLICY "System owner manage subscription changes"
  ON public.subscription_changes
  FOR ALL
  USING (is_system_owner(auth.uid()));

-- 8. Função para calcular data de expiração
CREATE OR REPLACE FUNCTION public.calculate_expires_at(
  p_period public.billing_period,
  p_started_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_period
    WHEN 'monthly' THEN p_started_at + INTERVAL '1 month'
    WHEN 'semiannual' THEN p_started_at + INTERVAL '6 months'
    WHEN 'annual' THEN p_started_at + INTERVAL '12 months'
    WHEN 'lifetime' THEN NULL  -- Nunca expira
    ELSE p_started_at + INTERVAL '1 month'  -- Default mensal
  END;
END;
$$;

-- 9. Função para obter tempo restante em dias
CREATE OR REPLACE FUNCTION public.get_remaining_days(p_expires_at TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_expires_at IS NULL THEN
    RETURN NULL;  -- Lifetime
  END IF;
  
  RETURN GREATEST(0, EXTRACT(DAY FROM (p_expires_at - now()))::INTEGER);
END;
$$;

-- 10. Função para determinar status baseado na expiração
CREATE OR REPLACE FUNCTION public.compute_subscription_status(
  p_expires_at TIMESTAMPTZ,
  p_current_status public.subscription_status,
  p_grace_period_days INTEGER DEFAULT 7
)
RETURNS public.subscription_status
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_remaining_days INTEGER;
BEGIN
  -- Se já cancelada, mantém
  IF p_current_status = 'canceled' THEN
    RETURN 'canceled';
  END IF;
  
  -- Lifetime nunca expira
  IF p_expires_at IS NULL THEN
    RETURN 'active';
  END IF;
  
  v_remaining_days := EXTRACT(DAY FROM (p_expires_at - now()))::INTEGER;
  
  -- Expirado há mais dias que o período de graça
  IF v_remaining_days < -p_grace_period_days THEN
    RETURN 'expired';
  END IF;
  
  -- Expirado mas dentro do período de graça
  IF v_remaining_days < 0 THEN
    RETURN 'grace_period';
  END IF;
  
  -- Ativo normalmente
  RETURN 'active';
END;
$$;

-- 11. Função para criar assinatura
CREATE OR REPLACE FUNCTION public.create_subscription(
  p_workspace_id UUID,
  p_price_id UUID,
  p_started_at TIMESTAMPTZ DEFAULT now(),
  p_created_by UUID DEFAULT auth.uid()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_subscription_id UUID;
  v_plan_id UUID;
  v_period public.billing_period;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Verificar permissão
  IF NOT is_system_owner(auth.uid()) AND NOT is_owner_or_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão para criar assinatura';
  END IF;
  
  -- Buscar plano e período do preço
  SELECT pp.plan_id, pp.billing_period::public.billing_period
  INTO v_plan_id, v_period
  FROM plan_prices pp
  WHERE pp.id = p_price_id;
  
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Preço não encontrado';
  END IF;
  
  -- Calcular expiração
  v_expires_at := calculate_expires_at(v_period, p_started_at);
  
  -- Deletar assinatura existente (se houver)
  DELETE FROM workspace_subscriptions WHERE workspace_id = p_workspace_id;
  
  -- Criar nova assinatura
  INSERT INTO workspace_subscriptions (
    workspace_id, plan_id, price_id, status,
    started_at, expires_at, current_period,
    created_by, updated_by
  ) VALUES (
    p_workspace_id, v_plan_id, p_price_id, 'active',
    p_started_at, v_expires_at, v_period,
    p_created_by, p_created_by
  )
  RETURNING id INTO v_subscription_id;
  
  -- Atualizar plano no workspace
  UPDATE workspaces
  SET plan = (SELECT code FROM plans WHERE id = v_plan_id),
      updated_at = now()
  WHERE id = p_workspace_id;
  
  -- Registrar evento
  INSERT INTO billing_events (
    workspace_id, subscription_id, event_type,
    provider, payload
  ) VALUES (
    p_workspace_id, v_subscription_id, 'subscription.created',
    'manual', jsonb_build_object(
      'plan_id', v_plan_id,
      'price_id', p_price_id,
      'period', v_period,
      'expires_at', v_expires_at
    )
  );
  
  -- Registrar mudança
  INSERT INTO subscription_changes (
    workspace_id, subscription_id,
    to_plan_id, to_price_id,
    change_type, performed_by
  ) VALUES (
    p_workspace_id, v_subscription_id,
    v_plan_id, p_price_id,
    'activation', p_created_by
  );
  
  RETURN v_subscription_id;
END;
$$;

-- 12. Função para renovar assinatura
CREATE OR REPLACE FUNCTION public.renew_subscription(
  p_workspace_id UUID,
  p_new_price_id UUID DEFAULT NULL  -- Se NULL, renova com mesmo preço
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_subscription RECORD;
  v_price_id UUID;
  v_period public.billing_period;
  v_new_expires_at TIMESTAMPTZ;
  v_plan_id UUID;
BEGIN
  -- Verificar permissão
  IF NOT is_system_owner(auth.uid()) AND NOT is_owner_or_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão para renovar assinatura';
  END IF;
  
  -- Buscar assinatura atual
  SELECT * INTO v_subscription
  FROM workspace_subscriptions
  WHERE workspace_id = p_workspace_id;
  
  IF v_subscription IS NULL THEN
    RAISE EXCEPTION 'Workspace não possui assinatura';
  END IF;
  
  -- Determinar preço a usar
  v_price_id := COALESCE(p_new_price_id, v_subscription.price_id);
  
  -- Buscar período do preço
  SELECT pp.billing_period::public.billing_period, pp.plan_id
  INTO v_period, v_plan_id
  FROM plan_prices pp
  WHERE pp.id = v_price_id;
  
  -- Calcular nova expiração (a partir de agora, não da expiração anterior)
  v_new_expires_at := calculate_expires_at(v_period, now());
  
  -- Atualizar assinatura
  UPDATE workspace_subscriptions
  SET 
    price_id = v_price_id,
    plan_id = v_plan_id,
    status = 'active',
    started_at = now(),
    expires_at = v_new_expires_at,
    current_period = v_period,
    cancel_at_period_end = false,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = v_subscription.id;
  
  -- Atualizar plano no workspace
  UPDATE workspaces
  SET plan = (SELECT code FROM plans WHERE id = v_plan_id),
      updated_at = now()
  WHERE id = p_workspace_id;
  
  -- Registrar evento
  INSERT INTO billing_events (
    workspace_id, subscription_id, event_type,
    provider, payload
  ) VALUES (
    p_workspace_id, v_subscription.id, 'subscription.renewed',
    'manual', jsonb_build_object(
      'plan_id', v_plan_id,
      'price_id', v_price_id,
      'period', v_period,
      'expires_at', v_new_expires_at
    )
  );
  
  -- Registrar mudança
  INSERT INTO subscription_changes (
    workspace_id, subscription_id,
    from_plan_id, from_price_id,
    to_plan_id, to_price_id,
    change_type, performed_by
  ) VALUES (
    p_workspace_id, v_subscription.id,
    v_subscription.plan_id, v_subscription.price_id,
    v_plan_id, v_price_id,
    'renewal', auth.uid()
  );
  
  RETURN v_subscription.id;
END;
$$;

-- 13. Função para agendar downgrade no final do período
CREATE OR REPLACE FUNCTION public.schedule_downgrade(
  p_workspace_id UUID,
  p_target_price_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_subscription RECORD;
  v_target_plan_id UUID;
  v_change_id UUID;
BEGIN
  -- Verificar permissão
  IF NOT is_system_owner(auth.uid()) AND NOT is_owner_or_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão para agendar downgrade';
  END IF;
  
  -- Buscar assinatura atual
  SELECT * INTO v_subscription
  FROM workspace_subscriptions
  WHERE workspace_id = p_workspace_id;
  
  IF v_subscription IS NULL THEN
    RAISE EXCEPTION 'Workspace não possui assinatura';
  END IF;
  
  -- Buscar plano do preço target
  SELECT plan_id INTO v_target_plan_id
  FROM plan_prices
  WHERE id = p_target_price_id;
  
  IF v_target_plan_id IS NULL THEN
    RAISE EXCEPTION 'Preço de destino não encontrado';
  END IF;
  
  -- Marcar para cancelar no final do período
  UPDATE workspace_subscriptions
  SET 
    cancel_at_period_end = true,
    metadata = metadata || jsonb_build_object(
      'scheduled_downgrade', jsonb_build_object(
        'target_price_id', p_target_price_id,
        'target_plan_id', v_target_plan_id,
        'scheduled_at', now(),
        'reason', p_reason
      )
    ),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = v_subscription.id;
  
  -- Registrar mudança agendada
  INSERT INTO subscription_changes (
    workspace_id, subscription_id,
    from_plan_id, from_price_id,
    to_plan_id, to_price_id,
    change_type, scheduled_for,
    performed_by, reason
  ) VALUES (
    p_workspace_id, v_subscription.id,
    v_subscription.plan_id, v_subscription.price_id,
    v_target_plan_id, p_target_price_id,
    'downgrade', v_subscription.expires_at,
    auth.uid(), p_reason
  )
  RETURNING id INTO v_change_id;
  
  RETURN v_change_id;
END;
$$;

-- 14. Função para aplicar downgrade imediato (com validações)
CREATE OR REPLACE FUNCTION public.apply_immediate_downgrade(
  p_workspace_id UUID,
  p_target_price_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_subscription RECORD;
  v_target_plan RECORD;
  v_current_limits RECORD;
  v_target_limits RECORD;
  v_usage RECORD;
BEGIN
  -- Verificar permissão - APENAS system owner pode fazer downgrade imediato
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores do sistema podem fazer downgrade imediato';
  END IF;
  
  -- Buscar assinatura atual
  SELECT ws.*, p.code as current_plan_code
  INTO v_subscription
  FROM workspace_subscriptions ws
  JOIN plans p ON p.id = ws.plan_id
  WHERE ws.workspace_id = p_workspace_id;
  
  IF v_subscription IS NULL THEN
    RAISE EXCEPTION 'Workspace não possui assinatura';
  END IF;
  
  -- Buscar info do plano target
  SELECT pp.plan_id, p.code as plan_code
  INTO v_target_plan
  FROM plan_prices pp
  JOIN plans p ON p.id = pp.plan_id
  WHERE pp.id = p_target_price_id;
  
  -- Aplicar via create_subscription (que já faz tudo)
  RETURN create_subscription(p_workspace_id, p_target_price_id, now(), auth.uid());
END;
$$;

-- 15. Função para obter detalhes completos da assinatura
CREATE OR REPLACE FUNCTION public.get_subscription_details(p_workspace_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  workspace_id UUID,
  plan_id UUID,
  plan_code TEXT,
  plan_name TEXT,
  price_id UUID,
  price_amount NUMERIC,
  price_currency TEXT,
  status public.subscription_status,
  computed_status public.subscription_status,
  current_period public.billing_period,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  remaining_days INTEGER,
  is_expiring BOOLEAN,
  is_expired BOOLEAN,
  is_in_grace_period BOOLEAN,
  cancel_at_period_end BOOLEAN,
  scheduled_downgrade JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining INTEGER;
  v_computed_status public.subscription_status;
BEGIN
  RETURN QUERY
  SELECT
    ws.id as subscription_id,
    ws.workspace_id,
    ws.plan_id,
    p.code as plan_code,
    p.name as plan_name,
    ws.price_id,
    pp.amount as price_amount,
    pp.currency as price_currency,
    ws.status,
    compute_subscription_status(ws.expires_at, ws.status, ws.grace_period_days) as computed_status,
    ws.current_period,
    ws.started_at,
    ws.expires_at,
    get_remaining_days(ws.expires_at) as remaining_days,
    (get_remaining_days(ws.expires_at) <= 7 AND get_remaining_days(ws.expires_at) > 0) as is_expiring,
    (get_remaining_days(ws.expires_at) < -ws.grace_period_days) as is_expired,
    (get_remaining_days(ws.expires_at) < 0 AND get_remaining_days(ws.expires_at) >= -ws.grace_period_days) as is_in_grace_period,
    ws.cancel_at_period_end,
    (ws.metadata->'scheduled_downgrade') as scheduled_downgrade,
    ws.created_at
  FROM workspace_subscriptions ws
  JOIN plans p ON p.id = ws.plan_id
  LEFT JOIN plan_prices pp ON pp.id = ws.price_id
  WHERE ws.workspace_id = p_workspace_id;
END;
$$;

-- 16. Função admin para listar todas as assinaturas (com filtros)
CREATE OR REPLACE FUNCTION public.admin_list_subscriptions(
  p_status public.subscription_status DEFAULT NULL,
  p_expiring_in_days INTEGER DEFAULT NULL
)
RETURNS TABLE (
  subscription_id UUID,
  workspace_id UUID,
  workspace_name TEXT,
  plan_code TEXT,
  plan_name TEXT,
  price_amount NUMERIC,
  status public.subscription_status,
  computed_status public.subscription_status,
  current_period public.billing_period,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  remaining_days INTEGER,
  is_expiring BOOLEAN,
  cancel_at_period_end BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Apenas system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores do sistema';
  END IF;
  
  RETURN QUERY
  SELECT
    ws.id as subscription_id,
    ws.workspace_id,
    w.name as workspace_name,
    p.code as plan_code,
    p.name as plan_name,
    pp.amount as price_amount,
    ws.status,
    compute_subscription_status(ws.expires_at, ws.status, ws.grace_period_days) as computed_status,
    ws.current_period,
    ws.started_at,
    ws.expires_at,
    get_remaining_days(ws.expires_at) as remaining_days,
    (get_remaining_days(ws.expires_at) <= 7 AND get_remaining_days(ws.expires_at) > 0) as is_expiring,
    ws.cancel_at_period_end,
    ws.created_at
  FROM workspace_subscriptions ws
  JOIN workspaces w ON w.id = ws.workspace_id
  JOIN plans p ON p.id = ws.plan_id
  LEFT JOIN plan_prices pp ON pp.id = ws.price_id
  WHERE 
    (p_status IS NULL OR ws.status = p_status)
    AND (p_expiring_in_days IS NULL OR get_remaining_days(ws.expires_at) <= p_expiring_in_days)
  ORDER BY ws.expires_at ASC NULLS LAST;
END;
$$;

-- 17. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workspace_subscriptions_updated_at
  BEFORE UPDATE ON public.workspace_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_subscription_updated_at();

-- 18. Adicionar coluna 'semiannual' aos preços existentes (verificar se billing_period é TEXT)
-- Já que billing_period é TEXT, podemos usar semiannual diretamente
