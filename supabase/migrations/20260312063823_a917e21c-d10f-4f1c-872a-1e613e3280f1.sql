-- Índices compostos workspace_id + status para queries do Financeiro
-- Elimina full scans em tabelas filtradas por workspace + status

-- cash_ledger: filtrado por workspace_id + status
CREATE INDEX IF NOT EXISTS idx_cash_ledger_ws_status 
  ON public.cash_ledger(workspace_id, status);

-- despesas_administrativas: filtrado por workspace_id + status
CREATE INDEX IF NOT EXISTS idx_despesas_admin_ws_status 
  ON public.despesas_administrativas(workspace_id, status);

-- pagamentos_operador: filtrado por workspace_id + status
CREATE INDEX IF NOT EXISTS idx_pagamentos_op_ws_status 
  ON public.pagamentos_operador(workspace_id, status);

-- bookmakers: filtrado por workspace_id + status
CREATE INDEX IF NOT EXISTS idx_bookmakers_ws_status 
  ON public.bookmakers(workspace_id, status);

-- parceiros: filtrado por workspace_id + status
CREATE INDEX IF NOT EXISTS idx_parceiros_ws_status 
  ON public.parceiros(workspace_id, status);

-- parcerias: filtrado por workspace_id + status
CREATE INDEX IF NOT EXISTS idx_parcerias_ws_status 
  ON public.parcerias(workspace_id, status);

-- indicador_acordos: filtrado por workspace_id + ativo
CREATE INDEX IF NOT EXISTS idx_indicador_acordos_ws_ativo 
  ON public.indicador_acordos(workspace_id, ativo);

-- participacao_ciclos: filtrado por workspace_id + status
CREATE INDEX IF NOT EXISTS idx_participacao_ciclos_ws_status 
  ON public.participacao_ciclos(workspace_id, status);

-- apostas_unificada: filtrado por workspace_id + resultado (NOT NULL check)
CREATE INDEX IF NOT EXISTS idx_apostas_unif_ws_resultado 
  ON public.apostas_unificada(workspace_id) WHERE resultado IS NOT NULL;