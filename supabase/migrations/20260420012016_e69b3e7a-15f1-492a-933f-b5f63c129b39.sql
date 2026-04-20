-- Tabela que persiste a agenda (data + ordem) gerada por um plano de distribuição
CREATE TABLE IF NOT EXISTS public.distribuicao_plano_agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plano_id uuid NOT NULL REFERENCES public.distribuicao_planos(id) ON DELETE CASCADE,
  celula_id uuid NOT NULL REFERENCES public.distribuicao_plano_celulas(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  ordem_dia integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente', -- pendente | aplicada | cancelada
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (celula_id)
);

CREATE INDEX IF NOT EXISTS idx_dpa_plano_data ON public.distribuicao_plano_agenda(plano_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_dpa_workspace_data ON public.distribuicao_plano_agenda(workspace_id, scheduled_date);

ALTER TABLE public.distribuicao_plano_agenda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agenda_select_workspace" ON public.distribuicao_plano_agenda
  FOR SELECT USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "agenda_insert_workspace" ON public.distribuicao_plano_agenda
  FOR INSERT WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "agenda_update_workspace" ON public.distribuicao_plano_agenda
  FOR UPDATE USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "agenda_delete_workspace" ON public.distribuicao_plano_agenda
  FOR DELETE USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TRIGGER trg_dpa_updated_at
  BEFORE UPDATE ON public.distribuicao_plano_agenda
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.distribuicao_plano_agenda IS
  'Materializa a agenda automática gerada para um plano de distribuição. Cada linha vincula uma célula (CPF×Casa) a uma data específica, respeitando meta diária USD e regras de execução do grupo.';