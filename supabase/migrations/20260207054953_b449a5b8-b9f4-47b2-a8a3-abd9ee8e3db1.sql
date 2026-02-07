
DROP FUNCTION IF EXISTS public.get_bookmaker_withdrawal_lead_times(uuid[]);

CREATE OR REPLACE FUNCTION public.get_bookmaker_withdrawal_lead_times(_bookmaker_catalogo_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  bookmaker_catalogo_id uuid,
  avg_days numeric,
  total_saques bigint,
  min_days numeric,
  max_days numeric
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    b.bookmaker_catalogo_id,
    ROUND(AVG(EXTRACT(EPOCH FROM (cl.data_confirmacao::timestamp - cl.data_transacao::timestamp)) / 86400.0), 1) AS avg_days,
    COUNT(*)::bigint AS total_saques,
    ROUND(MIN(EXTRACT(EPOCH FROM (cl.data_confirmacao::timestamp - cl.data_transacao::timestamp)) / 86400.0), 1) AS min_days,
    ROUND(MAX(EXTRACT(EPOCH FROM (cl.data_confirmacao::timestamp - cl.data_transacao::timestamp)) / 86400.0), 1) AS max_days
  FROM cash_ledger cl
  JOIN bookmakers b ON b.id = cl.origem_bookmaker_id
  WHERE cl.tipo_transacao = 'saque'
    AND cl.status = 'confirmado'
    AND cl.data_confirmacao IS NOT NULL
    AND cl.data_transacao IS NOT NULL
    AND (_bookmaker_catalogo_ids IS NULL OR b.bookmaker_catalogo_id = ANY(_bookmaker_catalogo_ids))
  GROUP BY b.bookmaker_catalogo_id;
$$;
