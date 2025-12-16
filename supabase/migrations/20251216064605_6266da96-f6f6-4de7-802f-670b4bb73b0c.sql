-- Adicionar colunas de participação de investidor na tabela projetos
ALTER TABLE public.projetos 
ADD COLUMN IF NOT EXISTS investidor_id UUID REFERENCES public.investidores(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS percentual_investidor NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS base_calculo_investidor TEXT DEFAULT 'LUCRO_LIQUIDO';

-- Adicionar check constraint para base_calculo_investidor
ALTER TABLE public.projetos 
ADD CONSTRAINT chk_base_calculo_investidor 
CHECK (base_calculo_investidor IN ('LUCRO_BRUTO', 'LUCRO_LIQUIDO'));

-- Criar tabela de participações por ciclo
CREATE TABLE IF NOT EXISTS public.participacao_ciclos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  ciclo_id UUID NOT NULL REFERENCES public.projeto_ciclos(id) ON DELETE CASCADE,
  investidor_id UUID NOT NULL REFERENCES public.investidores(id) ON DELETE CASCADE,
  
  -- Configuração no momento da apuração
  percentual_aplicado NUMERIC NOT NULL,
  base_calculo TEXT NOT NULL,
  
  -- Valores calculados
  lucro_base NUMERIC NOT NULL DEFAULT 0,
  valor_participacao NUMERIC NOT NULL DEFAULT 0,
  
  -- Status e datas
  status TEXT NOT NULL DEFAULT 'A_PAGAR',
  data_apuracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_pagamento TIMESTAMP WITH TIME ZONE,
  
  -- Vínculo com pagamento
  pagamento_ledger_id UUID REFERENCES public.cash_ledger(id),
  
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Constraints
  CONSTRAINT chk_participacao_status CHECK (status IN ('A_PAGAR', 'PAGO')),
  CONSTRAINT chk_participacao_base_calculo CHECK (base_calculo IN ('LUCRO_BRUTO', 'LUCRO_LIQUIDO')),
  CONSTRAINT uq_participacao_ciclo UNIQUE (ciclo_id, investidor_id)
);

-- Enable RLS
ALTER TABLE public.participacao_ciclos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own participacao_ciclos"
ON public.participacao_ciclos FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own participacao_ciclos"
ON public.participacao_ciclos FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own participacao_ciclos"
ON public.participacao_ciclos FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own participacao_ciclos"
ON public.participacao_ciclos FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_participacao_ciclos_updated_at
BEFORE UPDATE ON public.participacao_ciclos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index para performance
CREATE INDEX IF NOT EXISTS idx_participacao_ciclos_status ON public.participacao_ciclos(status);
CREATE INDEX IF NOT EXISTS idx_participacao_ciclos_projeto ON public.participacao_ciclos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_participacao_ciclos_investidor ON public.participacao_ciclos(investidor_id);