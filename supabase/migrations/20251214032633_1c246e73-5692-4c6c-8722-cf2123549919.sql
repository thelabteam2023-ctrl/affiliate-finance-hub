-- =============================================
-- ARQUITETURA DE CICLOS E CONTRATOS DE OPERADOR
-- =============================================

-- 1. Tabela de Ciclos de Projeto
-- Representa períodos de apuração financeira dentro de cada projeto
CREATE TABLE public.projeto_ciclos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  numero_ciclo INTEGER NOT NULL DEFAULT 1,
  data_inicio DATE NOT NULL,
  data_fim_prevista DATE NOT NULL,
  data_fim_real DATE,
  status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO' CHECK (status IN ('EM_ANDAMENTO', 'FECHADO', 'CANCELADO')),
  lucro_bruto NUMERIC DEFAULT 0,
  lucro_liquido NUMERIC DEFAULT 0,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para ciclos
CREATE INDEX idx_projeto_ciclos_projeto ON public.projeto_ciclos(projeto_id);
CREATE INDEX idx_projeto_ciclos_status ON public.projeto_ciclos(status);
CREATE UNIQUE INDEX idx_projeto_ciclos_numero ON public.projeto_ciclos(projeto_id, numero_ciclo);

-- RLS para ciclos
ALTER TABLE public.projeto_ciclos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projeto_ciclos"
  ON public.projeto_ciclos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projeto_ciclos"
  ON public.projeto_ciclos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projeto_ciclos"
  ON public.projeto_ciclos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projeto_ciclos"
  ON public.projeto_ciclos FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Adicionar campos de regra de prejuízo em operador_projetos
ALTER TABLE public.operador_projetos 
ADD COLUMN IF NOT EXISTS regra_prejuizo TEXT DEFAULT 'ZERAR' CHECK (regra_prejuizo IN ('ZERAR', 'CARRY_FORWARD', 'PROPORCIONAL')),
ADD COLUMN IF NOT EXISTS prejuizo_acumulado NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS teto_pagamento NUMERIC,
ADD COLUMN IF NOT EXISTS piso_pagamento NUMERIC;

-- Comentários explicativos
COMMENT ON COLUMN public.operador_projetos.regra_prejuizo IS 'ZERAR: não acumula dívida | CARRY_FORWARD: abate do próximo | PROPORCIONAL: divide com empresa';
COMMENT ON COLUMN public.operador_projetos.prejuizo_acumulado IS 'Valor de prejuízo pendente para carry-forward';
COMMENT ON COLUMN public.operador_projetos.teto_pagamento IS 'Valor máximo de pagamento por ciclo';
COMMENT ON COLUMN public.operador_projetos.piso_pagamento IS 'Valor mínimo de pagamento por ciclo';

-- 3. Tabela de Pagamentos Propostos (aguardando aprovação)
CREATE TABLE public.pagamentos_propostos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  operador_id UUID NOT NULL REFERENCES public.operadores(id) ON DELETE CASCADE,
  operador_projeto_id UUID NOT NULL REFERENCES public.operador_projetos(id) ON DELETE CASCADE,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  ciclo_id UUID REFERENCES public.projeto_ciclos(id) ON DELETE SET NULL,
  
  -- Valores calculados
  lucro_base NUMERIC NOT NULL DEFAULT 0,
  valor_calculado NUMERIC NOT NULL DEFAULT 0,
  valor_ajustado NUMERIC,
  desconto_prejuizo_anterior NUMERIC DEFAULT 0,
  
  -- Metadados do cálculo
  modelo_pagamento TEXT NOT NULL,
  base_calculo TEXT,
  percentual_aplicado NUMERIC,
  valor_fixo_aplicado NUMERIC,
  
  -- Status e aprovação
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'APROVADO', 'REJEITADO', 'PAGO')),
  data_proposta TIMESTAMP WITH TIME ZONE DEFAULT now(),
  data_aprovacao TIMESTAMP WITH TIME ZONE,
  aprovado_por TEXT,
  motivo_rejeicao TEXT,
  
  -- Rastreabilidade
  pagamento_id UUID REFERENCES public.pagamentos_operador(id),
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para propostas
CREATE INDEX idx_pagamentos_propostos_operador ON public.pagamentos_propostos(operador_id);
CREATE INDEX idx_pagamentos_propostos_projeto ON public.pagamentos_propostos(projeto_id);
CREATE INDEX idx_pagamentos_propostos_status ON public.pagamentos_propostos(status);
CREATE INDEX idx_pagamentos_propostos_ciclo ON public.pagamentos_propostos(ciclo_id);

-- RLS para propostas
ALTER TABLE public.pagamentos_propostos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pagamentos_propostos"
  ON public.pagamentos_propostos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pagamentos_propostos"
  ON public.pagamentos_propostos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pagamentos_propostos"
  ON public.pagamentos_propostos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pagamentos_propostos"
  ON public.pagamentos_propostos FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Trigger para updated_at
CREATE TRIGGER update_projeto_ciclos_updated_at
  BEFORE UPDATE ON public.projeto_ciclos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pagamentos_propostos_updated_at
  BEFORE UPDATE ON public.pagamentos_propostos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();