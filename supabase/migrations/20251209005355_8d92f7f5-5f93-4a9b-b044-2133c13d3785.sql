
-- Create surebets table for arbitrage/bonus extraction operations
CREATE TABLE public.surebets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  data_operacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  evento TEXT NOT NULL,
  esporte TEXT NOT NULL,
  modelo TEXT NOT NULL DEFAULT '1-2', -- '1-X-2' or '1-2'
  stake_total NUMERIC NOT NULL DEFAULT 0,
  spread_calculado NUMERIC, -- juice/margin percentage
  roi_esperado NUMERIC, -- expected ROI percentage
  lucro_esperado NUMERIC, -- expected profit in currency
  lucro_real NUMERIC, -- actual profit after settlement
  roi_real NUMERIC, -- actual ROI after settlement
  status TEXT NOT NULL DEFAULT 'PENDENTE', -- PENDENTE, LIQUIDADA
  resultado TEXT, -- GREEN, RED, VOID after settlement
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.surebets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own surebets"
ON public.surebets FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own surebets"
ON public.surebets FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own surebets"
ON public.surebets FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own surebets"
ON public.surebets FOR DELETE
USING (auth.uid() = user_id);

-- Add surebet_id to apostas table
ALTER TABLE public.apostas
ADD COLUMN surebet_id UUID REFERENCES public.surebets(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX idx_surebets_projeto_id ON public.surebets(projeto_id);
CREATE INDEX idx_surebets_user_id ON public.surebets(user_id);
CREATE INDEX idx_surebets_status ON public.surebets(status);
CREATE INDEX idx_apostas_surebet_id ON public.apostas(surebet_id);

-- Trigger for updated_at
CREATE TRIGGER update_surebets_updated_at
BEFORE UPDATE ON public.surebets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
