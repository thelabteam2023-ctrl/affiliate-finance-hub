-- Create investidores table
CREATE TABLE public.investidores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT investidores_cpf_user_unique UNIQUE (cpf, user_id)
);

-- Enable RLS
ALTER TABLE public.investidores ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for investidores
CREATE POLICY "Users can view own investors"
ON public.investidores
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own investors"
ON public.investidores
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own investors"
ON public.investidores
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own investors"
ON public.investidores
FOR DELETE
USING (auth.uid() = user_id);

-- Add investidor_id to cash_ledger
ALTER TABLE public.cash_ledger
ADD COLUMN investidor_id UUID REFERENCES public.investidores(id);

-- Create trigger for investidores updated_at
CREATE TRIGGER update_investidores_updated_at
BEFORE UPDATE ON public.investidores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();