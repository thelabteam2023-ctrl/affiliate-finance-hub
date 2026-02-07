
-- Function to get average withdrawal lead time per bookmaker
-- Returns avg days between data_transacao and data_confirmacao for confirmed withdrawals
-- Scoped to workspace via RLS on cash_ledger
CREATE OR REPLACE FUNCTION public.get_bookmaker_withdrawal_lead_times(
  _bookmaker_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  bookmaker_id uuid,
  avg_days numeric,
  total_saques bigint,
  min_days numeric,
  max_days numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    cl.origem_bookmaker_id AS bookmaker_id,
    ROUND(AVG(EXTRACT(EPOCH FROM (cl.data_confirmacao::timestamp - cl.data_transacao::timestamp)) / 86400.0)::numeric, 1) AS avg_days,
    COUNT(*) AS total_saques,
    ROUND(MIN(EXTRACT(EPOCH FROM (cl.data_confirmacao::timestamp - cl.data_transacao::timestamp)) / 86400.0)::numeric, 1) AS min_days,
    ROUND(MAX(EXTRACT(EPOCH FROM (cl.data_confirmacao::timestamp - cl.data_transacao::timestamp)) / 86400.0)::numeric, 1) AS max_days
  FROM cash_ledger cl
  WHERE cl.tipo_transacao = 'SAQUE'
    AND cl.status = 'CONFIRMADO'
    AND cl.data_confirmacao IS NOT NULL
    AND cl.data_transacao IS NOT NULL
    AND cl.origem_bookmaker_id IS NOT NULL
    AND (_bookmaker_ids IS NULL OR cl.origem_bookmaker_id = ANY(_bookmaker_ids))
  GROUP BY cl.origem_bookmaker_id;
$$;
