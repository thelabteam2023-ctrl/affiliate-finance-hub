-- Create apostas_multiplas table for multiple bets (duplas and triplas)
CREATE TABLE public.apostas_multiplas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  projeto_id UUID NOT NULL,
  bookmaker_id UUID NOT NULL,
  
  -- Tipo de múltipla
  tipo_multipla TEXT NOT NULL DEFAULT 'DUPLA', -- DUPLA ou TRIPLA
  
  -- Valores financeiros
  stake NUMERIC NOT NULL,
  odd_final NUMERIC NOT NULL,
  retorno_potencial NUMERIC,
  lucro_prejuizo NUMERIC,
  valor_retorno NUMERIC,
  
  -- Seleções (JSON array)
  selecoes JSONB NOT NULL DEFAULT '[]',
  
  -- Status e resultado
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  resultado TEXT DEFAULT 'PENDENTE',
  
  -- Freebet
  tipo_freebet TEXT,
  gerou_freebet BOOLEAN DEFAULT false,
  valor_freebet_gerada NUMERIC DEFAULT 0,
  
  -- Metadados
  data_aposta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.apostas_multiplas ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own apostas_multiplas"
ON public.apostas_multiplas
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own apostas_multiplas"
ON public.apostas_multiplas
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own apostas_multiplas"
ON public.apostas_multiplas
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own apostas_multiplas"
ON public.apostas_multiplas
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_apostas_multiplas_updated_at
BEFORE UPDATE ON public.apostas_multiplas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();