-- =============================================
-- MÓDULO DE PLANOS & BILLING
-- =============================================

-- 1. Tabela de Planos (catálogo)
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'legacy')),
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de Entitlements (limites por plano)
CREATE TABLE public.plan_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID UNIQUE NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  max_active_partners INT,
  max_users INT,
  custom_permissions_enabled BOOLEAN DEFAULT false,
  max_custom_permissions INT,
  personalized_support BOOLEAN DEFAULT false,
  extra_features JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de Preços (por período/moeda)
CREATE TABLE public.plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly', 'lifetime')),
  currency TEXT NOT NULL DEFAULT 'BRL',
  amount NUMERIC(12,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  provider TEXT,
  provider_price_id TEXT,
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabela de Eventos de Venda
CREATE TABLE public.sales_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id),
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  price_id UUID REFERENCES public.plan_prices(id),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL CHECK (status IN ('paid', 'pending', 'refunded', 'canceled')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('landing', 'referral', 'manual', 'upgrade', 'downgrade')),
  customer_email TEXT,
  customer_name TEXT,
  provider TEXT,
  provider_event_id TEXT UNIQUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_plans_status ON public.plans(status);
CREATE INDEX idx_plan_prices_active ON public.plan_prices(plan_id, is_active);
CREATE INDEX idx_sales_created ON public.sales_events(created_at);
CREATE INDEX idx_sales_status ON public.sales_events(status);
CREATE INDEX idx_sales_plan ON public.sales_events(plan_id);
CREATE INDEX idx_sales_workspace ON public.sales_events(workspace_id);

-- RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_events ENABLE ROW LEVEL SECURITY;

-- Políticas: Planos são públicos para leitura
CREATE POLICY "Plans are publicly readable" ON public.plans
  FOR SELECT USING (true);

CREATE POLICY "System owners can manage plans" ON public.plans
  FOR ALL USING (public.is_system_owner(auth.uid()));

-- Políticas: Entitlements são públicos para leitura
CREATE POLICY "Entitlements are publicly readable" ON public.plan_entitlements
  FOR SELECT USING (true);

CREATE POLICY "System owners can manage entitlements" ON public.plan_entitlements
  FOR ALL USING (public.is_system_owner(auth.uid()));

-- Políticas: Preços ativos são públicos
CREATE POLICY "Active prices are publicly readable" ON public.plan_prices
  FOR SELECT USING (is_active = true);

CREATE POLICY "System owners can manage prices" ON public.plan_prices
  FOR ALL USING (public.is_system_owner(auth.uid()));

-- Políticas: Vendas só para system owners
CREATE POLICY "System owners can view sales" ON public.sales_events
  FOR SELECT USING (public.is_system_owner(auth.uid()));

CREATE POLICY "System owners can manage sales" ON public.sales_events
  FOR ALL USING (public.is_system_owner(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plan_entitlements_updated_at
  BEFORE UPDATE ON public.plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plan_prices_updated_at
  BEFORE UPDATE ON public.plan_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- MIGRAR DADOS ATUAIS
-- =============================================

-- Inserir planos
INSERT INTO public.plans (code, name, description, display_order, status) VALUES
  ('free', 'Free', 'Para começar com controle', 1, 'active'),
  ('starter', 'Starter', 'Para quem já opera', 2, 'active'),
  ('pro', 'Pro', 'Para operações sérias', 3, 'active'),
  ('advanced', 'Advanced', 'Liberdade total', 4, 'active');

-- Inserir entitlements
INSERT INTO public.plan_entitlements (plan_id, max_active_partners, max_users, custom_permissions_enabled, max_custom_permissions, personalized_support)
SELECT id, 3, 1, false, 0, false FROM public.plans WHERE code = 'free';

INSERT INTO public.plan_entitlements (plan_id, max_active_partners, max_users, custom_permissions_enabled, max_custom_permissions, personalized_support)
SELECT id, 6, 1, false, 0, false FROM public.plans WHERE code = 'starter';

INSERT INTO public.plan_entitlements (plan_id, max_active_partners, max_users, custom_permissions_enabled, max_custom_permissions, personalized_support)
SELECT id, 20, 2, true, 5, false FROM public.plans WHERE code = 'pro';

INSERT INTO public.plan_entitlements (plan_id, max_active_partners, max_users, custom_permissions_enabled, max_custom_permissions, personalized_support)
SELECT id, NULL, 10, true, NULL, true FROM public.plans WHERE code = 'advanced';

-- Inserir preços mensais (BRL)
INSERT INTO public.plan_prices (plan_id, billing_period, currency, amount, is_active)
SELECT id, 'monthly', 'BRL', 0, true FROM public.plans WHERE code = 'free';

INSERT INTO public.plan_prices (plan_id, billing_period, currency, amount, is_active)
SELECT id, 'monthly', 'BRL', 89, true FROM public.plans WHERE code = 'starter';

INSERT INTO public.plan_prices (plan_id, billing_period, currency, amount, is_active)
SELECT id, 'monthly', 'BRL', 197, true FROM public.plans WHERE code = 'pro';

INSERT INTO public.plan_prices (plan_id, billing_period, currency, amount, is_active)
SELECT id, 'monthly', 'BRL', 697, true FROM public.plans WHERE code = 'advanced';

-- =============================================
-- FUNÇÕES ATUALIZADAS
-- =============================================

-- Atualizar get_plan_entitlements para ler do banco
CREATE OR REPLACE FUNCTION public.get_plan_entitlements(plan_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'max_active_partners', COALESCE(e.max_active_partners, 9999),
    'max_users', COALESCE(e.max_users, 9999),
    'custom_permissions_enabled', COALESCE(e.custom_permissions_enabled, false),
    'max_custom_permissions', COALESCE(e.max_custom_permissions, 0),
    'personalized_support', COALESCE(e.personalized_support, false)
  ) INTO result
  FROM plans p
  JOIN plan_entitlements e ON e.plan_id = p.id
  WHERE p.code = plan_name AND p.status = 'active';
  
  -- Fallback para planos não encontrados
  IF result IS NULL THEN
    result := jsonb_build_object(
      'max_active_partners', 3,
      'max_users', 1,
      'custom_permissions_enabled', false,
      'max_custom_permissions', 0,
      'personalized_support', false
    );
  END IF;
  
  RETURN result;
END;
$$;

-- Função para retornar planos públicos para landing
CREATE OR REPLACE FUNCTION public.get_public_plans()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'code', p.code,
        'name', p.name,
        'description', p.description,
        'display_order', p.display_order,
        'entitlements', jsonb_build_object(
          'max_partners', e.max_active_partners,
          'max_users', e.max_users,
          'custom_permissions', e.custom_permissions_enabled,
          'max_custom_permissions', e.max_custom_permissions,
          'personalized_support', e.personalized_support
        ),
        'prices', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id', pr.id,
              'period', pr.billing_period,
              'currency', pr.currency,
              'amount', pr.amount
            )
          ), '[]'::jsonb)
          FROM plan_prices pr
          WHERE pr.plan_id = p.id AND pr.is_active = true
        )
      ) ORDER BY p.display_order
    ), '[]'::jsonb)
    FROM plans p
    JOIN plan_entitlements e ON e.plan_id = p.id
    WHERE p.status = 'active'
  );
END;
$$;

-- Função para KPIs de billing
CREATE OR REPLACE FUNCTION public.admin_get_billing_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Verificar se é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  SELECT jsonb_build_object(
    'mrr', (
      SELECT COALESCE(SUM(amount), 0) 
      FROM sales_events 
      WHERE status = 'paid' AND created_at >= CURRENT_DATE - INTERVAL '30 days'
    ),
    'arr_estimated', (
      SELECT COALESCE(SUM(amount), 0) * 12 
      FROM sales_events 
      WHERE status = 'paid' AND created_at >= CURRENT_DATE - INTERVAL '30 days'
    ),
    'month_revenue', (
      SELECT COALESCE(SUM(amount), 0) 
      FROM sales_events 
      WHERE status = 'paid' AND created_at >= date_trunc('month', CURRENT_DATE)
    ),
    'new_subscriptions', (
      SELECT COUNT(*) 
      FROM sales_events 
      WHERE status = 'paid' AND created_at >= date_trunc('month', CURRENT_DATE)
    ),
    'cancellations', (
      SELECT COUNT(*) 
      FROM sales_events 
      WHERE status = 'canceled' AND created_at >= date_trunc('month', CURRENT_DATE)
    ),
    'refunds', (
      SELECT COUNT(*) 
      FROM sales_events 
      WHERE status = 'refunded' AND created_at >= date_trunc('month', CURRENT_DATE)
    ),
    'avg_ticket', (
      SELECT COALESCE(AVG(amount), 0) 
      FROM sales_events 
      WHERE status = 'paid'
    ),
    'total_sales', (
      SELECT COUNT(*) 
      FROM sales_events 
      WHERE status = 'paid'
    ),
    'total_revenue', (
      SELECT COALESCE(SUM(amount), 0) 
      FROM sales_events 
      WHERE status = 'paid'
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Função para listar vendas com filtros
CREATE OR REPLACE FUNCTION public.admin_get_sales(
  _from_date date DEFAULT NULL,
  _to_date date DEFAULT NULL,
  _status text DEFAULT NULL,
  _plan_code text DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  workspace_id uuid,
  workspace_name text,
  plan_id uuid,
  plan_code text,
  plan_name text,
  price_id uuid,
  amount numeric,
  currency text,
  status text,
  source text,
  customer_email text,
  customer_name text,
  provider text,
  provider_event_id text,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verificar se é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  RETURN QUERY
  SELECT 
    s.id,
    s.workspace_id,
    w.name as workspace_name,
    s.plan_id,
    p.code as plan_code,
    p.name as plan_name,
    s.price_id,
    s.amount,
    s.currency,
    s.status,
    s.source,
    s.customer_email,
    s.customer_name,
    s.provider,
    s.provider_event_id,
    s.metadata,
    s.created_at
  FROM sales_events s
  LEFT JOIN workspaces w ON w.id = s.workspace_id
  JOIN plans p ON p.id = s.plan_id
  WHERE 
    (_from_date IS NULL OR s.created_at::date >= _from_date)
    AND (_to_date IS NULL OR s.created_at::date <= _to_date)
    AND (_status IS NULL OR s.status = _status)
    AND (_plan_code IS NULL OR p.code = _plan_code)
  ORDER BY s.created_at DESC
  LIMIT _limit
  OFFSET _offset;
END;
$$;

-- Função para receita diária (gráfico)
CREATE OR REPLACE FUNCTION public.admin_get_daily_revenue(_days int DEFAULT 30)
RETURNS TABLE(date date, revenue numeric, sales_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verificar se é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  RETURN QUERY
  SELECT 
    d.date,
    COALESCE(SUM(s.amount), 0) as revenue,
    COUNT(s.id) as sales_count
  FROM generate_series(
    CURRENT_DATE - (_days || ' days')::interval,
    CURRENT_DATE,
    '1 day'::interval
  ) d(date)
  LEFT JOIN sales_events s ON s.created_at::date = d.date AND s.status = 'paid'
  GROUP BY d.date
  ORDER BY d.date;
END;
$$;

-- Função para receita por plano (gráfico)
CREATE OR REPLACE FUNCTION public.admin_get_revenue_by_plan()
RETURNS TABLE(plan_code text, plan_name text, revenue numeric, sales_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verificar se é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  RETURN QUERY
  SELECT 
    p.code as plan_code,
    p.name as plan_name,
    COALESCE(SUM(s.amount), 0) as revenue,
    COUNT(s.id) as sales_count
  FROM plans p
  LEFT JOIN sales_events s ON s.plan_id = p.id AND s.status = 'paid'
  GROUP BY p.id, p.code, p.name
  ORDER BY revenue DESC;
END;
$$;

-- Função para criar venda manualmente
CREATE OR REPLACE FUNCTION public.admin_create_sale(
  _plan_code text,
  _amount numeric,
  _currency text DEFAULT 'BRL',
  _status text DEFAULT 'paid',
  _source text DEFAULT 'manual',
  _customer_email text DEFAULT NULL,
  _customer_name text DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _plan_id uuid;
  _price_id uuid;
  _sale_id uuid;
BEGIN
  -- Verificar se é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  -- Buscar plan_id
  SELECT id INTO _plan_id FROM plans WHERE code = _plan_code;
  IF _plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan not found: %', _plan_code;
  END IF;

  -- Buscar price_id ativo (se existir)
  SELECT id INTO _price_id 
  FROM plan_prices 
  WHERE plan_id = _plan_id AND currency = _currency AND is_active = true
  LIMIT 1;

  -- Criar evento de venda
  INSERT INTO sales_events (
    workspace_id, plan_id, price_id, amount, currency, status, source,
    customer_email, customer_name, provider, provider_event_id, metadata
  ) VALUES (
    _workspace_id, _plan_id, _price_id, _amount, _currency, _status, _source,
    _customer_email, _customer_name, 'manual', gen_random_uuid()::text, _metadata
  ) RETURNING id INTO _sale_id;

  RETURN _sale_id;
END;
$$;

-- Função para atualizar status de venda (não deletar, apenas mudar status)
CREATE OR REPLACE FUNCTION public.admin_update_sale_status(_sale_id uuid, _new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verificar se é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  UPDATE sales_events
  SET status = _new_status
  WHERE id = _sale_id;
END;
$$;