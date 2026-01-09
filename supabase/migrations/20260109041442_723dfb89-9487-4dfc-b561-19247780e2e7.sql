-- Tabela para registrar giros grátis disponíveis (promoções pendentes)
CREATE TABLE public.giros_gratis_disponiveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id UUID NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  bookmaker_id UUID NOT NULL REFERENCES bookmakers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Detalhes da promoção
  quantidade_giros INTEGER NOT NULL DEFAULT 1,
  valor_por_giro NUMERIC(12,2) NOT NULL,
  valor_total NUMERIC(12,2) GENERATED ALWAYS AS (quantidade_giros * valor_por_giro) STORED,
  motivo TEXT NOT NULL DEFAULT 'Promoção',
  
  -- Datas e controle
  data_recebido TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_validade TIMESTAMPTZ,
  
  -- Status: DISPONIVEL, UTILIZADO, EXPIRADO, CANCELADO
  status TEXT NOT NULL DEFAULT 'DISPONIVEL',
  
  -- Link para o resultado (quando utilizado)
  giro_gratis_resultado_id UUID REFERENCES giros_gratis(id),
  data_utilizacao TIMESTAMPTZ,
  
  -- Observações
  observacoes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_giros_disponiveis_projeto ON giros_gratis_disponiveis(projeto_id);
CREATE INDEX idx_giros_disponiveis_status ON giros_gratis_disponiveis(status);
CREATE INDEX idx_giros_disponiveis_bookmaker ON giros_gratis_disponiveis(bookmaker_id);
CREATE INDEX idx_giros_disponiveis_workspace ON giros_gratis_disponiveis(workspace_id);
CREATE INDEX idx_giros_disponiveis_validade ON giros_gratis_disponiveis(data_validade) 
  WHERE status = 'DISPONIVEL';

-- RLS policies (workspace isolation)
ALTER TABLE giros_gratis_disponiveis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_giros_disponiveis" ON giros_gratis_disponiveis
  FOR SELECT USING (workspace_id = get_current_workspace());

CREATE POLICY "insert_giros_disponiveis" ON giros_gratis_disponiveis
  FOR INSERT WITH CHECK (workspace_id = get_current_workspace());

CREATE POLICY "update_giros_disponiveis" ON giros_gratis_disponiveis
  FOR UPDATE USING (workspace_id = get_current_workspace());

CREATE POLICY "delete_giros_disponiveis" ON giros_gratis_disponiveis
  FOR DELETE USING (workspace_id = get_current_workspace());

-- Trigger para updated_at
CREATE TRIGGER update_giros_disponiveis_updated_at
  BEFORE UPDATE ON giros_gratis_disponiveis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Adicionar coluna de referência na tabela giros_gratis existente
ALTER TABLE giros_gratis 
ADD COLUMN giro_disponivel_id UUID REFERENCES giros_gratis_disponiveis(id);

CREATE INDEX idx_giros_gratis_disponivel ON giros_gratis(giro_disponivel_id);