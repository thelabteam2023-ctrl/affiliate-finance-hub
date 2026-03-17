
CREATE TABLE public.bookmaker_indisponiveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parceiro_id uuid NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  bookmaker_catalogo_id uuid NOT NULL REFERENCES public.bookmakers_catalogo(id) ON DELETE CASCADE,
  marcado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, parceiro_id, bookmaker_catalogo_id)
);

ALTER TABLE public.bookmaker_indisponiveis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace indisponiveis"
  ON public.bookmaker_indisponiveis FOR SELECT TO authenticated
  USING (workspace_id = public.get_user_workspace(auth.uid()));

CREATE POLICY "Members can insert workspace indisponiveis"
  ON public.bookmaker_indisponiveis FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.get_user_workspace(auth.uid()));

CREATE POLICY "Members can delete workspace indisponiveis"
  ON public.bookmaker_indisponiveis FOR DELETE TO authenticated
  USING (workspace_id = public.get_user_workspace(auth.uid()));

CREATE INDEX idx_bookmaker_indisponiveis_lookup
  ON public.bookmaker_indisponiveis (workspace_id, bookmaker_catalogo_id);
