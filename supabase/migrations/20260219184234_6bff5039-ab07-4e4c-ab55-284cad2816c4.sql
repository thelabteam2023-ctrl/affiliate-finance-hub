
-- ============================================================
-- MÓDULO DE OCORRÊNCIAS OPERACIONAIS
-- ============================================================

-- Enum: Tipo de Ocorrência
CREATE TYPE public.ocorrencia_tipo AS ENUM (
  'saque_atrasado',
  'deposito_nao_creditado',
  'financeiro',
  'bug_sistema',
  'afiliado',
  'compliance',
  'outros'
);

-- Enum: Prioridade
CREATE TYPE public.ocorrencia_prioridade AS ENUM (
  'baixa',
  'media',
  'alta',
  'urgente'
);

-- Enum: Status
CREATE TYPE public.ocorrencia_status AS ENUM (
  'aberto',
  'em_andamento',
  'aguardando_terceiro',
  'resolvido',
  'cancelado'
);

-- Enum: Tipo de Evento da Timeline
CREATE TYPE public.ocorrencia_evento_tipo AS ENUM (
  'criacao',
  'comentario',
  'anexo',
  'status_alterado',
  'executor_alterado',
  'observador_adicionado',
  'observador_removido',
  'prioridade_alterada',
  'vinculo_adicionado'
);

-- ============================================================
-- TABELA PRINCIPAL: ocorrencias
-- ============================================================
CREATE TABLE public.ocorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  tipo public.ocorrencia_tipo NOT NULL DEFAULT 'outros',
  prioridade public.ocorrencia_prioridade NOT NULL DEFAULT 'media',
  status public.ocorrencia_status NOT NULL DEFAULT 'aberto',
  
  -- Pessoas
  requerente_id UUID NOT NULL,
  executor_id UUID NOT NULL,
  
  -- Vínculos opcionais com entidades do sistema
  bookmaker_id UUID REFERENCES public.bookmakers(id) ON DELETE SET NULL,
  projeto_id UUID REFERENCES public.projetos(id) ON DELETE SET NULL,
  parceiro_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  aposta_id UUID REFERENCES public.apostas_unificada(id) ON DELETE SET NULL,
  wallet_id TEXT,
  
  -- SLA
  sla_horas INTEGER,
  sla_alerta_em TIMESTAMP WITH TIME ZONE,
  sla_violado BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadados pré-preenchidos
  contexto_metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- TABELA: ocorrencias_eventos (Timeline Auditável)
-- ============================================================
CREATE TABLE public.ocorrencias_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id UUID NOT NULL REFERENCES public.ocorrencias(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  tipo public.ocorrencia_evento_tipo NOT NULL,
  conteudo TEXT,
  autor_id UUID NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  anexos JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================
-- TABELA: ocorrencias_observadores
-- ============================================================
CREATE TABLE public.ocorrencias_observadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id UUID NOT NULL REFERENCES public.ocorrencias(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  added_by UUID NOT NULL,
  UNIQUE(ocorrencia_id, user_id)
);

-- ============================================================
-- TABELA: ocorrencias_sla_config
-- ============================================================
CREATE TABLE public.ocorrencias_sla_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE,
  sla_urgente_horas INTEGER NOT NULL DEFAULT 4,
  sla_alta_horas INTEGER NOT NULL DEFAULT 24,
  sla_media_horas INTEGER NOT NULL DEFAULT 72,
  sla_baixa_horas INTEGER NOT NULL DEFAULT 168,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_ocorrencias_workspace ON public.ocorrencias(workspace_id);
CREATE INDEX idx_ocorrencias_status ON public.ocorrencias(status);
CREATE INDEX idx_ocorrencias_executor ON public.ocorrencias(executor_id);
CREATE INDEX idx_ocorrencias_requerente ON public.ocorrencias(requerente_id);
CREATE INDEX idx_ocorrencias_prioridade ON public.ocorrencias(prioridade);
CREATE INDEX idx_ocorrencias_created_at ON public.ocorrencias(created_at DESC);
CREATE INDEX idx_ocorrencias_eventos_ocorrencia ON public.ocorrencias_eventos(ocorrencia_id);
CREATE INDEX idx_ocorrencias_observadores_user ON public.ocorrencias_observadores(user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_ocorrencias_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_ocorrencias_updated_at
  BEFORE UPDATE ON public.ocorrencias
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ocorrencias_updated_at();

CREATE TRIGGER trg_ocorrencias_sla_config_updated_at
  BEFORE UPDATE ON public.ocorrencias_sla_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ocorrencias_updated_at();

-- Auto-calcular SLA ao inserir
CREATE OR REPLACE FUNCTION public.calcular_sla_ocorrencia()
RETURNS TRIGGER AS $$
DECLARE
  v_horas INTEGER;
  v_config RECORD;
BEGIN
  SELECT * INTO v_config
  FROM public.ocorrencias_sla_config
  WHERE workspace_id = NEW.workspace_id;
  
  IF NEW.prioridade = 'urgente' THEN
    v_horas := COALESCE(v_config.sla_urgente_horas, 4);
  ELSIF NEW.prioridade = 'alta' THEN
    v_horas := COALESCE(v_config.sla_alta_horas, 24);
  ELSIF NEW.prioridade = 'media' THEN
    v_horas := COALESCE(v_config.sla_media_horas, 72);
  ELSE
    v_horas := COALESCE(v_config.sla_baixa_horas, 168);
  END IF;
  
  NEW.sla_horas := v_horas;
  NEW.sla_alerta_em := now() + (v_horas || ' hours')::INTERVAL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_calcular_sla_ocorrencia
  BEFORE INSERT ON public.ocorrencias
  FOR EACH ROW
  EXECUTE FUNCTION public.calcular_sla_ocorrencia();

-- Verificar SLA violado ao atualizar
CREATE OR REPLACE FUNCTION public.verificar_sla_ocorrencia()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sla_alerta_em IS NOT NULL 
     AND now() > NEW.sla_alerta_em
     AND NEW.status NOT IN ('resolvido'::public.ocorrencia_status, 'cancelado'::public.ocorrencia_status) THEN
    NEW.sla_violado := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_verificar_sla_ocorrencia
  BEFORE UPDATE ON public.ocorrencias
  FOR EACH ROW
  EXECUTE FUNCTION public.verificar_sla_ocorrencia();

-- ============================================================
-- HELPER: verificar membro ativo do workspace
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_workspace_member_active(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id
      AND workspace_id = _workspace_id
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner_or_admin(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id
      AND workspace_id = _workspace_id
      AND is_active = true
      AND role IN ('owner', 'admin')
  );
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias_observadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias_sla_config ENABLE ROW LEVEL SECURITY;

-- ocorrencias
CREATE POLICY "select_ocorrencias"
  ON public.ocorrencias FOR SELECT TO authenticated
  USING (public.is_workspace_member_active(auth.uid(), workspace_id));

CREATE POLICY "insert_ocorrencias"
  ON public.ocorrencias FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_member_active(auth.uid(), workspace_id)
    AND requerente_id = auth.uid()
  );

CREATE POLICY "update_ocorrencias"
  ON public.ocorrencias FOR UPDATE TO authenticated
  USING (public.is_workspace_member_active(auth.uid(), workspace_id));

CREATE POLICY "delete_ocorrencias"
  ON public.ocorrencias FOR DELETE TO authenticated
  USING (public.is_workspace_owner_or_admin(auth.uid(), workspace_id));

-- ocorrencias_eventos
CREATE POLICY "select_ocorrencias_eventos"
  ON public.ocorrencias_eventos FOR SELECT TO authenticated
  USING (public.is_workspace_member_active(auth.uid(), workspace_id));

CREATE POLICY "insert_ocorrencias_eventos"
  ON public.ocorrencias_eventos FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_member_active(auth.uid(), workspace_id)
    AND autor_id = auth.uid()
  );

-- ocorrencias_observadores
CREATE POLICY "select_ocorrencias_observadores"
  ON public.ocorrencias_observadores FOR SELECT TO authenticated
  USING (public.is_workspace_member_active(auth.uid(), workspace_id));

CREATE POLICY "insert_ocorrencias_observadores"
  ON public.ocorrencias_observadores FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_member_active(auth.uid(), workspace_id)
    AND added_by = auth.uid()
  );

CREATE POLICY "delete_ocorrencias_observadores"
  ON public.ocorrencias_observadores FOR DELETE TO authenticated
  USING (public.is_workspace_member_active(auth.uid(), workspace_id));

-- ocorrencias_sla_config
CREATE POLICY "select_sla_config"
  ON public.ocorrencias_sla_config FOR SELECT TO authenticated
  USING (public.is_workspace_member_active(auth.uid(), workspace_id));

CREATE POLICY "manage_sla_config"
  ON public.ocorrencias_sla_config FOR ALL TO authenticated
  USING (public.is_workspace_owner_or_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_owner_or_admin(auth.uid(), workspace_id));

-- ============================================================
-- STORAGE BUCKET para Anexos de Ocorrências
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ocorrencias-anexos',
  'ocorrencias-anexos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
);

CREATE POLICY "upload_ocorrencias_anexos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ocorrencias-anexos');

CREATE POLICY "read_ocorrencias_anexos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ocorrencias-anexos');

CREATE POLICY "delete_ocorrencias_anexos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ocorrencias-anexos');
