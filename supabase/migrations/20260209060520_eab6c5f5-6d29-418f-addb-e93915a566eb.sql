
CREATE OR REPLACE FUNCTION get_volume_pl_by_catalogo_limitadas(p_workspace_id UUID)
RETURNS TABLE (
  bookmaker_catalogo_id UUID,
  total_volume NUMERIC,
  total_pl NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    b.bookmaker_catalogo_id,
    COALESCE(SUM(ABS(COALESCE(a.stake, 0))), 0) as total_volume,
    COALESCE(SUM(COALESCE(a.lucro_prejuizo, 0)), 0) as total_pl
  FROM apostas_unificada a
  JOIN bookmakers b ON b.id = a.bookmaker_id
  WHERE b.workspace_id = p_workspace_id
    AND b.status = 'limitada'
    AND a.resultado IS NOT NULL
    AND b.bookmaker_catalogo_id IS NOT NULL
  GROUP BY b.bookmaker_catalogo_id;
$$;
