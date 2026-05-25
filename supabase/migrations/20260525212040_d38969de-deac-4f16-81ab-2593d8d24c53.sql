CREATE OR REPLACE FUNCTION public.get_logo_stats(p_date DATE)
RETURNS TABLE (
  with_logo BIGINT,
  without_logo BIGINT,
  teams_missing BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE home_team_logo IS NOT NULL) AS with_logo,
    COUNT(*) FILTER (WHERE home_team_logo IS NULL) AS without_logo,
    COUNT(DISTINCT home_team) FILTER (WHERE home_team_logo IS NULL) AS teams_missing
  FROM daily_events
  WHERE event_date = p_date;
END;
$$;
