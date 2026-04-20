-- Tabela de cenários de planejamento (simulações salvas)
CREATE TABLE public.planejamento_cenarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plano_id UUID NOT NULL,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  agendamentos JSONB NOT NULL DEFAULT '[]'::jsonb,
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  slots_aplicados JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_planejamento_cenarios_workspace ON public.planejamento_cenarios(workspace_id);
CREATE INDEX idx_planejamento_cenarios_plano ON public.planejamento_cenarios(plano_id);
CREATE INDEX idx_planejamento_cenarios_mes ON public.planejamento_cenarios(workspace_id, ano, mes);

ALTER TABLE public.planejamento_cenarios ENABLE ROW LEVEL SECURITY;

-- Políticas baseadas em workspace (mesmo padrão usado por distribuicao_planos)
CREATE POLICY "Users can view cenarios from their workspace"
ON public.planejamento_cenarios FOR SELECT
USING (workspace_id IN (
  SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
));

CREATE POLICY "Users can create cenarios in their workspace"
ON public.planejamento_cenarios FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
  AND user_id = auth.uid()
);

CREATE POLICY "Users can update cenarios in their workspace"
ON public.planejamento_cenarios FOR UPDATE
USING (workspace_id IN (
  SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete cenarios in their workspace"
ON public.planejamento_cenarios FOR DELETE
USING (workspace_id IN (
  SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
));

-- Trigger de updated_at
CREATE TRIGGER set_planejamento_cenarios_updated_at
BEFORE UPDATE ON public.planejamento_cenarios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();