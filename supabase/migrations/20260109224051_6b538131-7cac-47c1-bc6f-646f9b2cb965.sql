-- Tabela de Regras de Cashback
CREATE TABLE public.cashback_regras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Informações Básicas
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('promocional', 'permanente', 'estrategia')),
  
  -- Regra de Cálculo
  tipo TEXT NOT NULL CHECK (tipo IN ('sobre_perda', 'sobre_volume')),
  percentual NUMERIC(5,2) NOT NULL CHECK (percentual > 0 AND percentual <= 100),
  limite_maximo NUMERIC(12,2),
  periodo_apuracao TEXT NOT NULL CHECK (periodo_apuracao IN ('diario', 'semanal', 'mensal', 'personalizado')),
  periodo_dias_custom INTEGER,
  
  -- Condições (opcionais)
  odds_minimas NUMERIC(6,2),
  valor_minimo_aposta NUMERIC(12,2),
  esportes_validos TEXT[],
  mercados_validos TEXT[],
  
  -- Forma de Crédito
  tipo_credito TEXT NOT NULL CHECK (tipo_credito IN ('saldo_real', 'freebet', 'bonus_rollover')),
  prazo_credito TEXT NOT NULL CHECK (prazo_credito IN ('imediato', 'd1', 'dx')),
  prazo_dias_custom INTEGER,
  
  -- Controle
  aplicacao TEXT NOT NULL CHECK (aplicacao IN ('automatica', 'manual')),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado', 'encerrado')),
  
  -- Metadados
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de Registros de Cashback
CREATE TABLE public.cashback_registros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  regra_id UUID NOT NULL REFERENCES public.cashback_regras(id) ON DELETE CASCADE,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Período de referência
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  
  -- Cálculo
  volume_elegivel NUMERIC(14,2) NOT NULL DEFAULT 0,
  percentual_aplicado NUMERIC(5,2) NOT NULL,
  valor_calculado NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_recebido NUMERIC(12,2),
  
  -- Moeda
  moeda_operacao TEXT NOT NULL DEFAULT 'BRL',
  cotacao_snapshot NUMERIC(10,6),
  cotacao_snapshot_at TIMESTAMP WITH TIME ZONE,
  valor_brl_referencia NUMERIC(12,2),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'recebido', 'cancelado', 'expirado')),
  data_credito DATE,
  
  -- Metadados
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_cashback_regras_projeto ON public.cashback_regras(projeto_id);
CREATE INDEX idx_cashback_regras_bookmaker ON public.cashback_regras(bookmaker_id);
CREATE INDEX idx_cashback_regras_status ON public.cashback_regras(status);
CREATE INDEX idx_cashback_registros_regra ON public.cashback_registros(regra_id);
CREATE INDEX idx_cashback_registros_projeto ON public.cashback_registros(projeto_id);
CREATE INDEX idx_cashback_registros_periodo ON public.cashback_registros(periodo_inicio, periodo_fim);
CREATE INDEX idx_cashback_registros_status ON public.cashback_registros(status);

-- Enable RLS
ALTER TABLE public.cashback_regras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashback_registros ENABLE ROW LEVEL SECURITY;

-- RLS Policies para cashback_regras
CREATE POLICY "Users can view cashback rules in their workspace"
  ON public.cashback_regras FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create cashback rules in their workspace"
  ON public.cashback_regras FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update cashback rules in their workspace"
  ON public.cashback_regras FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete cashback rules in their workspace"
  ON public.cashback_regras FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies para cashback_registros
CREATE POLICY "Users can view cashback records in their workspace"
  ON public.cashback_registros FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create cashback records in their workspace"
  ON public.cashback_registros FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update cashback records in their workspace"
  ON public.cashback_registros FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete cashback records in their workspace"
  ON public.cashback_registros FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Trigger para atualizar updated_at
CREATE TRIGGER update_cashback_regras_updated_at
  BEFORE UPDATE ON public.cashback_regras
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cashback_registros_updated_at
  BEFORE UPDATE ON public.cashback_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();