-- Criar tabela para acordos de remuneração dos investidores
CREATE TABLE public.investidor_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investidor_id UUID NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tipo_deal TEXT NOT NULL DEFAULT 'FIXO',
  percentual_fixo NUMERIC DEFAULT 40,
  faixas_progressivas JSONB DEFAULT '[]',
  vigencia_inicio TIMESTAMP WITH TIME ZONE DEFAULT now(),
  vigencia_fim TIMESTAMP WITH TIME ZONE,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.investidor_deals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own deals"
ON public.investidor_deals
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own deals"
ON public.investidor_deals
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own deals"
ON public.investidor_deals
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own deals"
ON public.investidor_deals
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_investidor_deals_updated_at
BEFORE UPDATE ON public.investidor_deals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_investidor_deals_investidor_id ON public.investidor_deals(investidor_id);
CREATE INDEX idx_investidor_deals_user_id ON public.investidor_deals(user_id);