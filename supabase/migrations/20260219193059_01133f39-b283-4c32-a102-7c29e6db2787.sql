
-- ============================================================
-- MÓDULO DE SOLICITAÇÕES OPERACIONAIS
-- ============================================================

-- Enum: tipos de solicitação
CREATE TYPE public.solicitacao_tipo AS ENUM (
  'abertura_conta',
  'verificacao_kyc',
  'transferencia',
  'outros'
);

-- Enum: status da solicitação
CREATE TYPE public.solicitacao_status AS ENUM (
  'pendente',
  'em_execucao',
  'concluida',
  'recusada'
);

-- Enum: prioridade (reutilizar lógica das ocorrências)
CREATE TYPE public.solicitacao_prioridade AS ENUM (
  'baixa',
  'media',
  'alta',
  'urgente'
);

-- Tabela principal
CREATE TABLE public.solicitacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  tipo public.solicitacao_tipo NOT NULL DEFAULT 'outros',
  prioridade public.solicitacao_prioridade NOT NULL DEFAULT 'media',
  status public.solicitacao_status NOT NULL DEFAULT 'pendente',
  requerente_id UUID NOT NULL,
  executor_id UUID NOT NULL,
  observadores UUID[] DEFAULT '{}',
  -- Contexto opcional
  bookmaker_id UUID REFERENCES public.bookmakers(id) ON DELETE SET NULL,
  projeto_id UUID REFERENCES public.projetos(id) ON DELETE SET NULL,
  parceiro_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  contexto_metadata JSONB,
  -- Controle
  recusa_motivo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  concluida_at TIMESTAMP WITH TIME ZONE,
  recusada_at TIMESTAMP WITH TIME ZONE
);

-- Trigger updated_at
CREATE TRIGGER update_solicitacoes_updated_at
  BEFORE UPDATE ON public.solicitacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX idx_solicitacoes_workspace ON public.solicitacoes(workspace_id);
CREATE INDEX idx_solicitacoes_executor ON public.solicitacoes(executor_id);
CREATE INDEX idx_solicitacoes_requerente ON public.solicitacoes(requerente_id);
CREATE INDEX idx_solicitacoes_status ON public.solicitacoes(status);
CREATE INDEX idx_solicitacoes_tipo ON public.solicitacoes(tipo);
CREATE INDEX idx_solicitacoes_created_at ON public.solicitacoes(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.solicitacoes ENABLE ROW LEVEL SECURITY;

-- Membros ativos do workspace podem ver todas as solicitações
CREATE POLICY "Membros podem ver solicitações do workspace"
  ON public.solicitacoes
  FOR SELECT
  USING (public.is_workspace_member_active(auth.uid(), workspace_id));

-- Membros ativos podem criar solicitações
CREATE POLICY "Membros podem criar solicitações"
  ON public.solicitacoes
  FOR INSERT
  WITH CHECK (
    public.is_workspace_member_active(auth.uid(), workspace_id)
    AND requerente_id = auth.uid()
  );

-- Requerente ou executor podem atualizar
CREATE POLICY "Requerente ou executor podem atualizar solicitação"
  ON public.solicitacoes
  FOR UPDATE
  USING (
    public.is_workspace_member_active(auth.uid(), workspace_id)
    AND (requerente_id = auth.uid() OR executor_id = auth.uid())
  );

-- Apenas requerente pode deletar (e somente se pendente)
CREATE POLICY "Requerente pode deletar solicitação pendente"
  ON public.solicitacoes
  FOR DELETE
  USING (
    requerente_id = auth.uid()
    AND status = 'pendente'
  );

-- ============================================================
-- STORAGE: bucket para anexos de solicitações
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'solicitacoes-anexos',
  'solicitacoes-anexos',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Membros podem ler anexos de solicitações"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'solicitacoes-anexos'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Membros podem enviar anexos de solicitações"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'solicitacoes-anexos'
    AND auth.uid() IS NOT NULL
  );
