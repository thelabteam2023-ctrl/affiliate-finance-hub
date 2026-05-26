
CREATE OR REPLACE FUNCTION public.normalize_team_name(name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    lower(translate(coalesce(name,''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇñÑ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUCnN')),
    '[^a-z0-9]', '', 'g'
  );
$$;

DROP FUNCTION IF EXISTS public.backfill_daily_event_logos(date);
CREATE OR REPLACE FUNCTION public.backfill_daily_event_logos(p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_exact int := 0;
  updated_alias int := 0;
  updated_sub int := 0;
BEGIN
  -- 1) match exato
  WITH evs AS (
    SELECT id, league_key,
           public.normalize_team_name(home_team) AS home_n,
           public.normalize_team_name(away_team) AS away_n
    FROM public.daily_events
    WHERE event_date = p_date
      AND (home_team_logo IS NULL OR away_team_logo IS NULL)
  ),
  h AS (SELECT e.id, tl.logo_url FROM evs e JOIN public.team_logos tl
        ON tl.league_key=e.league_key AND tl.team_name_normalized=e.home_n AND tl.found),
  a AS (SELECT e.id, tl.logo_url FROM evs e JOIN public.team_logos tl
        ON tl.league_key=e.league_key AND tl.team_name_normalized=e.away_n AND tl.found),
  upd AS (
    UPDATE public.daily_events de
       SET home_team_logo = COALESCE(de.home_team_logo, h.logo_url),
           away_team_logo = COALESCE(de.away_team_logo, a.logo_url)
      FROM evs e LEFT JOIN h ON h.id=e.id LEFT JOIN a ON a.id=e.id
     WHERE de.id=e.id AND (h.logo_url IS NOT NULL OR a.logo_url IS NOT NULL)
     RETURNING 1
  ) SELECT count(*) INTO updated_exact FROM upd;

  -- 2) aliases
  WITH evs AS (
    SELECT id, league_key,
           public.normalize_team_name(home_team) AS home_n,
           public.normalize_team_name(away_team) AS away_n
    FROM public.daily_events
    WHERE event_date = p_date
      AND (home_team_logo IS NULL OR away_team_logo IS NULL)
  ),
  h AS (SELECT e.id, tl.logo_url FROM evs e
        JOIN public.team_name_aliases al ON al.league_key=e.league_key AND al.alias_normalized=e.home_n
        JOIN public.team_logos tl ON tl.id=al.team_logo_id AND tl.found),
  a AS (SELECT e.id, tl.logo_url FROM evs e
        JOIN public.team_name_aliases al ON al.league_key=e.league_key AND al.alias_normalized=e.away_n
        JOIN public.team_logos tl ON tl.id=al.team_logo_id AND tl.found),
  upd AS (
    UPDATE public.daily_events de
       SET home_team_logo = COALESCE(de.home_team_logo, h.logo_url),
           away_team_logo = COALESCE(de.away_team_logo, a.logo_url)
      FROM evs e LEFT JOIN h ON h.id=e.id LEFT JOIN a ON a.id=e.id
     WHERE de.id=e.id AND (h.logo_url IS NOT NULL OR a.logo_url IS NOT NULL)
     RETURNING 1
  ) SELECT count(*) INTO updated_alias FROM upd;

  -- 3) fallback substring (escolhe o menor nome candidato)
  WITH evs AS (
    SELECT id, league_key,
           public.normalize_team_name(home_team) AS home_n,
           public.normalize_team_name(away_team) AS away_n
    FROM public.daily_events
    WHERE event_date = p_date
      AND (home_team_logo IS NULL OR away_team_logo IS NULL)
  ),
  h AS (SELECT DISTINCT ON (e.id) e.id, tl.logo_url FROM evs e
        JOIN public.team_logos tl ON tl.league_key=e.league_key AND tl.found
         AND length(e.home_n)>=4
         AND (tl.team_name_normalized LIKE '%'||e.home_n||'%'
              OR e.home_n LIKE '%'||tl.team_name_normalized||'%')
        ORDER BY e.id, length(tl.team_name_normalized)),
  a AS (SELECT DISTINCT ON (e.id) e.id, tl.logo_url FROM evs e
        JOIN public.team_logos tl ON tl.league_key=e.league_key AND tl.found
         AND length(e.away_n)>=4
         AND (tl.team_name_normalized LIKE '%'||e.away_n||'%'
              OR e.away_n LIKE '%'||tl.team_name_normalized||'%')
        ORDER BY e.id, length(tl.team_name_normalized)),
  upd AS (
    UPDATE public.daily_events de
       SET home_team_logo = COALESCE(de.home_team_logo, h.logo_url),
           away_team_logo = COALESCE(de.away_team_logo, a.logo_url)
      FROM evs e LEFT JOIN h ON h.id=e.id LEFT JOIN a ON a.id=e.id
     WHERE de.id=e.id AND (h.logo_url IS NOT NULL OR a.logo_url IS NOT NULL)
     RETURNING 1
  ) SELECT count(*) INTO updated_sub FROM upd;

  RETURN jsonb_build_object(
    'exact', updated_exact,
    'alias', updated_alias,
    'substring', updated_sub,
    'total', updated_exact + updated_alias + updated_sub
  );
END;
$$;
