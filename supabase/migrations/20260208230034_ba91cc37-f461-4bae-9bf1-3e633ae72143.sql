
-- View: Inteligência Longitudinal Global por Bookmaker (agrega por bookmaker_catalogo_id cross-project)
CREATE OR REPLACE VIEW public.v_limitation_stats_global AS
WITH events_enriched AS (
  SELECT
    le.*,
    b.bookmaker_catalogo_id,
    bc.nome AS catalogo_nome,
    bc.logo_url
  FROM limitation_events le
  JOIN bookmakers b ON b.id = le.bookmaker_id
  LEFT JOIN bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
  WHERE b.bookmaker_catalogo_id IS NOT NULL
),
agg AS (
  SELECT
    e.workspace_id,
    e.bookmaker_catalogo_id,
    MAX(e.catalogo_nome) AS bookmaker_nome,
    MAX(e.logo_url) AS logo_url,
    COUNT(*)::int AS total_events,
    COUNT(DISTINCT e.projeto_id)::int AS total_projects,
    COUNT(DISTINCT e.bookmaker_id)::int AS total_vinculos,
    ROUND(AVG(e.project_bets_before_limitation), 1)::float AS avg_bets_before_limitation,
    ROUND(STDDEV_POP(e.project_bets_before_limitation), 1)::float AS stddev_bets,
    COUNT(*) FILTER (WHERE e.limitation_bucket = 'early')::int AS early_count,
    COUNT(*) FILTER (WHERE e.limitation_bucket = 'mid')::int AS mid_count,
    COUNT(*) FILTER (WHERE e.limitation_bucket = 'late')::int AS late_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE e.limitation_bucket = 'early') / NULLIF(COUNT(*), 0), 0)::int AS early_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE e.limitation_bucket = 'mid') / NULLIF(COUNT(*), 0), 0)::int AS mid_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE e.limitation_bucket = 'late') / NULLIF(COUNT(*), 0), 0)::int AS late_pct,
    MODE() WITHIN GROUP (ORDER BY e.limitation_type) AS most_common_type,
    MAX(e.event_timestamp) AS last_limitation_at,
    MIN(e.event_timestamp) AS first_limitation_at
  FROM events_enriched e
  GROUP BY e.workspace_id, e.bookmaker_catalogo_id
)
SELECT
  a.*,
  -- Strategic Profile
  CASE
    WHEN a.total_events < 2 THEN 'low_data'
    WHEN a.early_pct >= 50 THEN 'early_limiter'
    WHEN a.mid_pct >= 50 THEN 'mid_limiter'
    WHEN a.late_pct >= 50 THEN 'late_limiter'
    ELSE 'mixed'
  END AS strategic_profile,
  -- Confidence Score
  CASE
    WHEN a.total_events >= 5 AND a.total_projects >= 2 THEN 'HIGH'
    WHEN a.total_events >= 3 THEN 'MEDIUM'
    ELSE 'LOW'
  END AS confidence_score
FROM agg a;
