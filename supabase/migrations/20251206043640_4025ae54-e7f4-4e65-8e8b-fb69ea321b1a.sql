-- Create table to track bookmaker history per project
CREATE TABLE public.projeto_bookmaker_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  parceiro_id UUID REFERENCES public.parceiros(id),
  bookmaker_nome TEXT NOT NULL,
  parceiro_nome TEXT,
  data_vinculacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_desvinculacao TIMESTAMP WITH TIME ZONE,
  status_final TEXT, -- ATIVO, LIMITADA, DEVOLVIDA
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(projeto_id, bookmaker_id)
);

-- Enable RLS
ALTER TABLE public.projeto_bookmaker_historico ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own projeto_bookmaker_historico"
  ON public.projeto_bookmaker_historico
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projeto_bookmaker_historico"
  ON public.projeto_bookmaker_historico
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projeto_bookmaker_historico"
  ON public.projeto_bookmaker_historico
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projeto_bookmaker_historico"
  ON public.projeto_bookmaker_historico
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX idx_projeto_bookmaker_historico_projeto ON public.projeto_bookmaker_historico(projeto_id);
CREATE INDEX idx_projeto_bookmaker_historico_bookmaker ON public.projeto_bookmaker_historico(bookmaker_id);