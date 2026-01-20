-- Tabela para armazenar preferência de tab/página inicial por projeto por usuário
CREATE TABLE public.project_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  default_tab TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, project_id)
);

-- Índices para performance
CREATE INDEX idx_project_user_preferences_user_project ON public.project_user_preferences(user_id, project_id);
CREATE INDEX idx_project_user_preferences_workspace ON public.project_user_preferences(workspace_id);

-- Enable RLS
ALTER TABLE public.project_user_preferences ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: usuários só podem ver/editar suas próprias preferências
CREATE POLICY "Users can view their own preferences"
ON public.project_user_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.project_user_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.project_user_preferences
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences"
ON public.project_user_preferences
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_project_user_preferences_updated_at
BEFORE UPDATE ON public.project_user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();