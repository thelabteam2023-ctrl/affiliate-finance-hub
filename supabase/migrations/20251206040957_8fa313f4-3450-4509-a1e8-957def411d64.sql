-- Create projeto_perdas table for operational losses
CREATE TABLE public.projeto_perdas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  bookmaker_id UUID REFERENCES public.bookmakers(id) ON DELETE SET NULL,
  valor NUMERIC NOT NULL,
  categoria TEXT NOT NULL,
  descricao TEXT,
  data_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.projeto_perdas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own projeto_perdas"
ON public.projeto_perdas
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projeto_perdas"
ON public.projeto_perdas
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projeto_perdas"
ON public.projeto_perdas
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projeto_perdas"
ON public.projeto_perdas
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_projeto_perdas_updated_at
BEFORE UPDATE ON public.projeto_perdas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_projeto_perdas_projeto_id ON public.projeto_perdas(projeto_id);
CREATE INDEX idx_projeto_perdas_user_id ON public.projeto_perdas(user_id);