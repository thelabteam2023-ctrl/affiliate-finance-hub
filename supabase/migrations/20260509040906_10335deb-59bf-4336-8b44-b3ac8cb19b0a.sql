-- Parcerias
CREATE INDEX IF NOT EXISTS idx_parcerias_parceiro_id ON public.parcerias(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_parcerias_fornecedor_id ON public.parcerias(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_parcerias_indicacao_id ON public.parcerias(indicacao_id);

-- Operadores
CREATE INDEX IF NOT EXISTS idx_operadores_auth_user_id ON public.operadores(auth_user_id);

-- Movimentacoes Indicacao
CREATE INDEX IF NOT EXISTS idx_mov_indicacao_parceria_tipo ON public.movimentacoes_indicacao(parceria_id, tipo);

-- Fluxo Cards
CREATE INDEX IF NOT EXISTS idx_fluxo_cards_workspace_coluna ON public.fluxo_cards(workspace_id, coluna_id);
