DROP FUNCTION IF EXISTS public.get_volume_pl_by_catalogo_limitadas(UUID);

CREATE FUNCTION public.get_volume_pl_by_catalogo_limitadas(p_workspace_id UUID)
RETURNS TABLE(bookmaker_catalogo_id UUID, total_volume NUMERIC, total_pl NUMERIC, moeda TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    sub.bookmaker_catalogo_id,
    sub.total_volume,
    sub.bet_pl + COALESCE(adj.adj_total, 0) as total_pl,
    sub.moeda
  FROM (
    SELECT 
      b.bookmaker_catalogo_id,
      COALESCE(SUM(ABS(COALESCE(a.stake, 0))), 0) as total_volume,
      COALESCE(SUM(COALESCE(a.lucro_prejuizo, 0)), 0) as bet_pl,
      MODE() WITHIN GROUP (ORDER BY b.moeda) as moeda
    FROM apostas_unificada a
    JOIN bookmakers b ON b.id = a.bookmaker_id
    WHERE b.workspace_id = p_workspace_id
      AND b.status = 'limitada'
      AND a.resultado IS NOT NULL
      AND b.bookmaker_catalogo_id IS NOT NULL
    GROUP BY b.bookmaker_catalogo_id
  ) sub
  LEFT JOIN (
    SELECT 
      bc.bookmaker_catalogo_id,
      SUM(fe.valor) as adj_total
    FROM financial_events fe
    JOIN bookmakers bc ON bc.id = fe.bookmaker_id
    WHERE fe.workspace_id = p_workspace_id
      AND fe.tipo_evento = 'AJUSTE'
      AND fe.origem = 'AJUSTE'
      AND bc.status = 'limitada'
      AND bc.bookmaker_catalogo_id IS NOT NULL
    GROUP BY bc.bookmaker_catalogo_id
  ) adj ON adj.bookmaker_catalogo_id = sub.bookmaker_catalogo_id;
$$;