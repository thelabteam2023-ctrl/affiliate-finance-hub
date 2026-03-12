
-- Índice 1: workspace + status (cobre queries gerais filtradas por status)
CREATE INDEX IF NOT EXISTS idx_mov_indicacao_ws_status 
  ON public.movimentacoes_indicacao(workspace_id, status);

-- Índice 2: workspace + tipo + status (cobre queries de pagamentos parceiro/fornecedor)
CREATE INDEX IF NOT EXISTS idx_mov_indicacao_ws_tipo_status 
  ON public.movimentacoes_indicacao(workspace_id, tipo, status);
