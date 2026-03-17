
-- Tabela de grupos de bookmakers
CREATE TABLE public.bookmaker_grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, nome)
);

-- Tabela de membros (junction)
CREATE TABLE public.bookmaker_grupo_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID NOT NULL REFERENCES public.bookmaker_grupos(id) ON DELETE CASCADE,
  bookmaker_catalogo_id UUID NOT NULL REFERENCES public.bookmakers_catalogo(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(grupo_id, bookmaker_catalogo_id)
);

-- Indexes
CREATE INDEX idx_bookmaker_grupos_workspace ON public.bookmaker_grupos(workspace_id);
CREATE INDEX idx_bookmaker_grupo_membros_grupo ON public.bookmaker_grupo_membros(grupo_id);
CREATE INDEX idx_bookmaker_grupo_membros_catalogo ON public.bookmaker_grupo_membros(bookmaker_catalogo_id);
CREATE INDEX idx_bookmaker_grupo_membros_workspace ON public.bookmaker_grupo_membros(workspace_id);

-- RLS
ALTER TABLE public.bookmaker_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmaker_grupo_membros ENABLE ROW LEVEL SECURITY;

-- Policies for bookmaker_grupos
CREATE POLICY "workspace_members_select_grupos" ON public.bookmaker_grupos
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "workspace_members_insert_grupos" ON public.bookmaker_grupos
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "workspace_members_update_grupos" ON public.bookmaker_grupos
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "workspace_members_delete_grupos" ON public.bookmaker_grupos
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- Policies for bookmaker_grupo_membros
CREATE POLICY "workspace_members_select_grupo_membros" ON public.bookmaker_grupo_membros
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "workspace_members_insert_grupo_membros" ON public.bookmaker_grupo_membros
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "workspace_members_delete_grupo_membros" ON public.bookmaker_grupo_membros
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
