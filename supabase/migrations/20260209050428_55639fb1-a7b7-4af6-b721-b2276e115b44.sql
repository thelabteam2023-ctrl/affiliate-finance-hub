
CREATE OR REPLACE FUNCTION public.get_avg_withdrawal_duration_by_catalogo(p_workspace_id UUID)
RETURNS TABLE(
  bookmaker_catalogo_id UUID,
  avg_days NUMERIC,
  total_confirmed BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.bookmaker_catalogo_id,
    ROUND(AVG(EXTRACT(EPOCH FROM (cl.data_confirmacao::timestamp - cl.data_transacao::timestamp)) / 86400.0)::numeric, 1) AS avg_days,
    COUNT(*) AS total_confirmed
  FROM cash_ledger cl
  JOIN bookmakers b ON b.id = cl.origem_bookmaker_id
  WHERE cl.workspace_id = p_workspace_id
    AND cl.tipo_transacao = 'SAQUE'
    AND cl.status = 'CONFIRMADO'
    AND cl.data_confirmacao IS NOT NULL
    AND cl.data_transacao IS NOT NULL
    AND b.bookmaker_catalogo_id IS NOT NULL
  GROUP BY b.bookmaker_catalogo_id
$$;
