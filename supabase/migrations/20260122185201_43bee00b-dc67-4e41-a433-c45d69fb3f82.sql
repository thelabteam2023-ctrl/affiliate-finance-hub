-- RPC para calcular totais de ajustes cambiais agrupados por moeda (para uso em resumos)
-- Esta função é independente da paginação e sempre retorna o total correto
CREATE OR REPLACE FUNCTION get_exchange_adjustment_totals(p_workspace_id uuid)
RETURNS TABLE (
  moeda text,
  total_ganhos numeric,
  total_perdas numeric,
  total_liquido numeric,
  count_conciliacoes bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    COALESCE(moeda_destino, 'USD') as moeda,
    COALESCE(SUM(CASE WHEN tipo_ajuste = 'GANHO_CAMBIAL' THEN diferenca ELSE 0 END), 0) as total_ganhos,
    COALESCE(SUM(CASE WHEN tipo_ajuste = 'PERDA_CAMBIAL' THEN ABS(diferenca) ELSE 0 END), 0) as total_perdas,
    COALESCE(
      SUM(CASE WHEN tipo_ajuste = 'GANHO_CAMBIAL' THEN diferenca ELSE 0 END) -
      SUM(CASE WHEN tipo_ajuste = 'PERDA_CAMBIAL' THEN ABS(diferenca) ELSE 0 END),
      0
    ) as total_liquido,
    COUNT(*) as count_conciliacoes
  FROM exchange_adjustments
  WHERE workspace_id = p_workspace_id
  GROUP BY COALESCE(moeda_destino, 'USD')
  ORDER BY count_conciliacoes DESC;
$$;

-- RPC para calcular totais de movimentações do cash_ledger (para KPIs)
-- Também independente da paginação
CREATE OR REPLACE FUNCTION get_cash_ledger_totals(
  p_workspace_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_tipos_transacao text[]
)
RETURNS TABLE (
  total_depositos numeric,
  total_saques numeric,
  total_liquido numeric,
  count_transacoes bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    COALESCE(SUM(CASE WHEN tipo_transacao = 'DEPOSITO' THEN valor ELSE 0 END), 0) as total_depositos,
    COALESCE(SUM(CASE WHEN tipo_transacao = 'SAQUE' THEN valor ELSE 0 END), 0) as total_saques,
    COALESCE(
      SUM(CASE WHEN tipo_transacao = 'DEPOSITO' THEN valor ELSE 0 END) -
      SUM(CASE WHEN tipo_transacao = 'SAQUE' THEN valor ELSE 0 END),
      0
    ) as total_liquido,
    COUNT(*) as count_transacoes
  FROM cash_ledger
  WHERE workspace_id = p_workspace_id
    AND data_transacao >= p_data_inicio
    AND data_transacao <= p_data_fim
    AND tipo_transacao = ANY(p_tipos_transacao);
$$;