CREATE TYPE public.distribuicao_regra_casa AS ENUM (
  'REPETIR_LIVRE',
  'NAO_REPETIR_NO_CPF',
  'RODIZIO_ENTRE_CPFS'
);

CREATE TYPE public.distribuicao_regra_ip AS ENUM (
  'IP_COMPARTILHADO_GRUPO',
  'IP_UNICO_POR_CASA'
);

CREATE TABLE public.distribuicao_planos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  parceiro_ids UUID[] NOT NULL DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_distribuicao_planos_workspace ON public.distribuicao_planos(workspace_id);

CREATE TABLE public.distribuicao_plano_grupos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plano_id UUID NOT NULL REFERENCES public.distribuicao_planos(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  grupo_id UUID NOT NULL REFERENCES public.bookmaker_grupos(id) ON DELETE CASCADE,
  regra_casa public.distribuicao_regra_casa NOT NULL DEFAULT 'NAO_REPETIR_NO_CPF',
  regra_ip public.distribuicao_regra_ip NOT NULL DEFAULT 'IP_COMPARTILHADO_GRUPO',
  casas_por_cpf INTEGER,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plano_id, grupo_id)
);
CREATE INDEX idx_distribuicao_plano_grupos_plano ON public.distribuicao_plano_grupos(plano_id);

CREATE TABLE public.distribuicao_plano_celulas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plano_id UUID NOT NULL REFERENCES public.distribuicao_planos(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plano_grupo_id UUID NOT NULL REFERENCES public.distribuicao_plano_grupos(id) ON DELETE CASCADE,
  parceiro_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  bookmaker_catalogo_id UUID NOT NULL REFERENCES public.bookmakers_catalogo(id) ON DELETE CASCADE,
  ip_slot TEXT,
  travada BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_distribuicao_celulas_plano ON public.distribuicao_plano_celulas(plano_id);
CREATE INDEX idx_distribuicao_celulas_parceiro ON public.distribuicao_plano_celulas(parceiro_id);

ALTER TABLE public.distribuicao_planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribuicao_plano_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribuicao_plano_celulas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members select planos" ON public.distribuicao_planos FOR SELECT USING (public.is_active_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members insert planos" ON public.distribuicao_planos FOR INSERT WITH CHECK (public.is_active_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members update planos" ON public.distribuicao_planos FOR UPDATE USING (public.is_active_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members delete planos" ON public.distribuicao_planos FOR DELETE USING (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "ws members select plano grupos" ON public.distribuicao_plano_grupos FOR SELECT USING (public.is_active_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members insert plano grupos" ON public.distribuicao_plano_grupos FOR INSERT WITH CHECK (public.is_active_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members update plano grupos" ON public.distribuicao_plano_grupos FOR UPDATE USING (public.is_active_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members delete plano grupos" ON public.distribuicao_plano_grupos FOR DELETE USING (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "ws members select celulas" ON public.distribuicao_plano_celulas FOR SELECT USING (public.is_active_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members insert celulas" ON public.distribuicao_plano_celulas FOR INSERT WITH CHECK (public.is_active_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members update celulas" ON public.distribuicao_plano_celulas FOR UPDATE USING (public.is_active_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members delete celulas" ON public.distribuicao_plano_celulas FOR DELETE USING (public.is_active_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER update_distribuicao_planos_updated_at
  BEFORE UPDATE ON public.distribuicao_planos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();