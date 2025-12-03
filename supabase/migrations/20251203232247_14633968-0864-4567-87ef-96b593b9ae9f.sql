-- Criar tabela de despesas administrativas do escritório
CREATE TABLE public.despesas_administrativas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('ENERGIA', 'INTERNET_4G', 'ALUGUEL', 'FUNCIONARIOS', 'OUTROS')),
  descricao TEXT,
  valor NUMERIC NOT NULL,
  data_despesa TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  recorrente BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'CONFIRMADO' CHECK (status IN ('CONFIRMADO', 'PENDENTE', 'CANCELADO')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.despesas_administrativas ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own despesas_administrativas"
ON public.despesas_administrativas
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own despesas_administrativas"
ON public.despesas_administrativas
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own despesas_administrativas"
ON public.despesas_administrativas
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own despesas_administrativas"
ON public.despesas_administrativas
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_despesas_administrativas_updated_at
BEFORE UPDATE ON public.despesas_administrativas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();