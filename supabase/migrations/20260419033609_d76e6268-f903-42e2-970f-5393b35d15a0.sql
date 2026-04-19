-- Tabela de IPs/Proxies disponíveis para planejamento
CREATE TABLE public.planning_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  label TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  proxy_type TEXT,
  location_country TEXT,
  location_city TEXT,
  provider TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planning_ips_workspace ON public.planning_ips(workspace_id);

-- Tabela de Wallets (cripto/USDT/BTC etc) reutilizáveis no planejamento
CREATE TABLE public.planning_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  label TEXT NOT NULL,
  asset TEXT NOT NULL,
  network TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planning_wallets_workspace ON public.planning_wallets(workspace_id);

-- Tabela principal de Campanhas planejadas
CREATE TABLE public.planning_campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  scheduled_date DATE NOT NULL,
  bookmaker_catalogo_id UUID REFERENCES public.bookmakers_catalogo(id) ON DELETE SET NULL,
  bookmaker_nome TEXT NOT NULL,
  deposit_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  parceiro_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  parceiro_snapshot JSONB,
  ip_id UUID REFERENCES public.planning_ips(id) ON DELETE SET NULL,
  wallet_id UUID REFERENCES public.planning_wallets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planning_campanhas_workspace_date ON public.planning_campanhas(workspace_id, scheduled_date);
CREATE INDEX idx_planning_campanhas_ip_date ON public.planning_campanhas(ip_id, scheduled_date);
CREATE INDEX idx_planning_campanhas_parceiro_date ON public.planning_campanhas(parceiro_id, scheduled_date);

-- Trigger updated_at
CREATE TRIGGER trg_planning_ips_updated BEFORE UPDATE ON public.planning_ips
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_planning_wallets_updated BEFORE UPDATE ON public.planning_wallets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_planning_campanhas_updated BEFORE UPDATE ON public.planning_campanhas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.planning_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_campanhas ENABLE ROW LEVEL SECURITY;

-- Policies: membros ativos do workspace podem ler/escrever
CREATE POLICY "planning_ips_select" ON public.planning_ips FOR SELECT
USING (public.is_active_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "planning_ips_insert" ON public.planning_ips FOR INSERT
WITH CHECK (public.is_active_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "planning_ips_update" ON public.planning_ips FOR UPDATE
USING (public.is_active_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "planning_ips_delete" ON public.planning_ips FOR DELETE
USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "planning_wallets_select" ON public.planning_wallets FOR SELECT
USING (public.is_active_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "planning_wallets_insert" ON public.planning_wallets FOR INSERT
WITH CHECK (public.is_active_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "planning_wallets_update" ON public.planning_wallets FOR UPDATE
USING (public.is_active_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "planning_wallets_delete" ON public.planning_wallets FOR DELETE
USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "planning_campanhas_select" ON public.planning_campanhas FOR SELECT
USING (public.is_active_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "planning_campanhas_insert" ON public.planning_campanhas FOR INSERT
WITH CHECK (public.is_active_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "planning_campanhas_update" ON public.planning_campanhas FOR UPDATE
USING (public.is_active_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "planning_campanhas_delete" ON public.planning_campanhas FOR DELETE
USING (public.is_active_workspace_member(workspace_id, auth.uid()));