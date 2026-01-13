-- Tabela para anotações livres (aba Livre)
CREATE TABLE public.anotacoes_livres (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conteudo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_anotacoes_livres_user_workspace ON public.anotacoes_livres(user_id, workspace_id);

-- Enable RLS
ALTER TABLE public.anotacoes_livres ENABLE ROW LEVEL SECURITY;

-- RLS Policies - usuário só vê suas próprias anotações no seu workspace
CREATE POLICY "Users can view own notes in workspace"
  ON public.anotacoes_livres FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own notes in workspace"
  ON public.anotacoes_livres FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notes in workspace"
  ON public.anotacoes_livres FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notes in workspace"
  ON public.anotacoes_livres FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_anotacoes_livres_updated_at
  BEFORE UPDATE ON public.anotacoes_livres
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();