-- Tabela para registros de giros grátis (free spins)
CREATE TABLE public.giros_gratis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Modo e dados do registro
  modo TEXT NOT NULL DEFAULT 'simples' CHECK (modo IN ('simples', 'detalhado')),
  data_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Modo detalhado: quantidade e valor por giro
  quantidade_giros INTEGER,
  valor_por_giro NUMERIC(15,2),
  
  -- Valor retornado (comum a ambos os modos)
  valor_retorno NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Observações
  observacoes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_giros_gratis_projeto ON public.giros_gratis(projeto_id);
CREATE INDEX idx_giros_gratis_bookmaker ON public.giros_gratis(bookmaker_id);
CREATE INDEX idx_giros_gratis_workspace ON public.giros_gratis(workspace_id);
CREATE INDEX idx_giros_gratis_data ON public.giros_gratis(data_registro);

-- Enable RLS
ALTER TABLE public.giros_gratis ENABLE ROW LEVEL SECURITY;

-- Políticas RLS usando workspace_members
CREATE POLICY "Users can view giros_gratis in their workspace"
  ON public.giros_gratis
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert giros_gratis in their workspace"
  ON public.giros_gratis
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update giros_gratis in their workspace"
  ON public.giros_gratis
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete giros_gratis in their workspace"
  ON public.giros_gratis
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Trigger para updated_at
CREATE TRIGGER update_giros_gratis_updated_at
  BEFORE UPDATE ON public.giros_gratis
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();