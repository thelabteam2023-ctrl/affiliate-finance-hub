-- Create projeto_acordos table for tripartite profit-sharing agreements
CREATE TABLE public.projeto_acordos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  investidor_id UUID REFERENCES public.investidores(id) ON DELETE SET NULL,
  
  -- Base de cálculo
  base_calculo TEXT NOT NULL DEFAULT 'LUCRO_LIQUIDO',
  -- 'LUCRO_BRUTO' = divisão sobre faturamento total
  -- 'LUCRO_LIQUIDO' = divisão após deduzir custos operador
  
  -- Divisão Investidor/Empresa
  percentual_investidor NUMERIC NOT NULL DEFAULT 40,
  percentual_empresa NUMERIC NOT NULL DEFAULT 60,
  
  -- Configurações adicionais
  deduzir_custos_operador BOOLEAN NOT NULL DEFAULT TRUE,
  -- Se TRUE: primeiro paga operador, depois divide resto
  -- Se FALSE: divide bruto, operador é custo da empresa
  
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create unique constraint for one active agreement per project
CREATE UNIQUE INDEX idx_projeto_acordos_projeto_ativo 
  ON public.projeto_acordos(projeto_id) 
  WHERE ativo = TRUE;

-- Enable RLS
ALTER TABLE public.projeto_acordos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own projeto_acordos" 
  ON public.projeto_acordos FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projeto_acordos" 
  ON public.projeto_acordos FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projeto_acordos" 
  ON public.projeto_acordos FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projeto_acordos" 
  ON public.projeto_acordos FOR DELETE 
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_projeto_acordos_updated_at
  BEFORE UPDATE ON public.projeto_acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();