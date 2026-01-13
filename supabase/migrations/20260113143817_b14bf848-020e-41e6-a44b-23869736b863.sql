-- Criar tabela de colunas do fluxo pessoal
CREATE TABLE public.fluxo_colunas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Garantir unicidade por usuário/workspace
  UNIQUE(user_id, workspace_id, nome)
);

-- Criar tabela de cards/anotações do fluxo
CREATE TABLE public.fluxo_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  coluna_id UUID NOT NULL REFERENCES public.fluxo_colunas(id) ON DELETE CASCADE,
  conteudo TEXT NOT NULL DEFAULT '',
  ordem INT NOT NULL DEFAULT 0,
  versao INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criar tabela de histórico de versões
CREATE TABLE public.fluxo_cards_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.fluxo_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conteudo TEXT NOT NULL,
  coluna_id UUID NOT NULL REFERENCES public.fluxo_colunas(id) ON DELETE CASCADE,
  versao INT NOT NULL,
  tipo_mudanca TEXT NOT NULL, -- 'criacao', 'edicao', 'movimentacao'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.fluxo_colunas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_cards_historico ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para fluxo_colunas (APENAS usuário próprio + workspace próprio)
CREATE POLICY "Usuário vê apenas suas colunas no workspace"
  ON public.fluxo_colunas FOR SELECT
  USING (auth.uid() = user_id AND workspace_id = workspace_id);

CREATE POLICY "Usuário cria apenas suas colunas"
  ON public.fluxo_colunas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário atualiza apenas suas colunas"
  ON public.fluxo_colunas FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuário deleta apenas suas colunas"
  ON public.fluxo_colunas FOR DELETE
  USING (auth.uid() = user_id);

-- Políticas RLS para fluxo_cards (APENAS usuário próprio + workspace próprio)
CREATE POLICY "Usuário vê apenas seus cards no workspace"
  ON public.fluxo_cards FOR SELECT
  USING (auth.uid() = user_id AND workspace_id = workspace_id);

CREATE POLICY "Usuário cria apenas seus cards"
  ON public.fluxo_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário atualiza apenas seus cards"
  ON public.fluxo_cards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuário deleta apenas seus cards"
  ON public.fluxo_cards FOR DELETE
  USING (auth.uid() = user_id);

-- Políticas RLS para fluxo_cards_historico
CREATE POLICY "Usuário vê apenas seu histórico"
  ON public.fluxo_cards_historico FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuário cria apenas seu histórico"
  ON public.fluxo_cards_historico FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_fluxo_colunas_updated_at
  BEFORE UPDATE ON public.fluxo_colunas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fluxo_cards_updated_at
  BEFORE UPDATE ON public.fluxo_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_fluxo_colunas_user_workspace ON public.fluxo_colunas(user_id, workspace_id);
CREATE INDEX idx_fluxo_cards_user_workspace ON public.fluxo_cards(user_id, workspace_id);
CREATE INDEX idx_fluxo_cards_coluna ON public.fluxo_cards(coluna_id);
CREATE INDEX idx_fluxo_cards_historico_card ON public.fluxo_cards_historico(card_id);