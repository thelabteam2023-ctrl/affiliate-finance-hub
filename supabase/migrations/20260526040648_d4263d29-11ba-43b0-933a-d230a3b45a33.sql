CREATE OR REPLACE FUNCTION public.normalize_team_match_key(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH cleaned AS (
    SELECT regexp_replace(
      lower(translate(coalesce(name,''),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÙÛÜÇñÑ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUCnN')),
      '[^a-z0-9]+', ' ', 'g'
    ) AS value
  ), tokens AS (
    SELECT tok
    FROM cleaned, unnest(regexp_split_to_array(trim(value), '\s+')) AS tok
    WHERE tok <> ''
      AND tok NOT IN ('fc','cf','cd','sc','ac','club','de','da','do','del','di','du','la','le','el','the')
  )
  SELECT coalesce(string_agg(tok, '' ORDER BY tok), '') FROM tokens;
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
  updated_relaxed int := 0;
  updated_global int := 0;
BEGIN
  -- 1) match exato dentro da mesma liga
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

  -- 2) aliases manuais dentro da mesma liga
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

  -- 3) match flexível dentro da mesma liga: ignora FC/CD/Club/de/la e variações pequenas
  WITH evs AS (
    SELECT id, league_key,
           public.normalize_team_match_key(home_team) AS home_k,
           public.normalize_team_match_key(away_team) AS away_k
    FROM public.daily_events
    WHERE event_date = p_date
      AND (home_team_logo IS NULL OR away_team_logo IS NULL)
  ),
  h AS (SELECT DISTINCT ON (e.id) e.id, tl.logo_url FROM evs e
        JOIN public.team_logos tl ON tl.league_key=e.league_key AND tl.found
         AND length(e.home_k)>=4
         AND (public.normalize_team_match_key(tl.team_name_original)=e.home_k
              OR public.normalize_team_match_key(tl.team_name_original) LIKE '%'||e.home_k||'%'
              OR e.home_k LIKE '%'||public.normalize_team_match_key(tl.team_name_original)||'%')
        ORDER BY e.id, length(public.normalize_team_match_key(tl.team_name_original)) DESC),
  a AS (SELECT DISTINCT ON (e.id) e.id, tl.logo_url FROM evs e
        JOIN public.team_logos tl ON tl.league_key=e.league_key AND tl.found
         AND length(e.away_k)>=4
         AND (public.normalize_team_match_key(tl.team_name_original)=e.away_k
              OR public.normalize_team_match_key(tl.team_name_original) LIKE '%'||e.away_k||'%'
              OR e.away_k LIKE '%'||public.normalize_team_match_key(tl.team_name_original)||'%')
        ORDER BY e.id, length(public.normalize_team_match_key(tl.team_name_original)) DESC),
  upd AS (
    UPDATE public.daily_events de
       SET home_team_logo = COALESCE(de.home_team_logo, h.logo_url),
           away_team_logo = COALESCE(de.away_team_logo, a.logo_url)
      FROM evs e LEFT JOIN h ON h.id=e.id LEFT JOIN a ON a.id=e.id
     WHERE de.id=e.id AND (h.logo_url IS NOT NULL OR a.logo_url IS NOT NULL)
     RETURNING 1
  ) SELECT count(*) INTO updated_relaxed FROM upd;

  -- 4) fallback global seguro: usa outros caches do mesmo esporte quando há um único logo distinto.
  -- Isso cobre times de Libertadores/Sudamericana que estão cacheados na liga nacional do país.
  WITH evs AS (
    SELECT id, sport,
           public.normalize_team_match_key(home_team) AS home_k,
           public.normalize_team_match_key(away_team) AS away_k
    FROM public.daily_events
    WHERE event_date = p_date
      AND (home_team_logo IS NULL OR away_team_logo IS NULL)
  ),
  hm AS (
    SELECT e.id, tl.logo_url
    FROM evs e
    JOIN public.team_logos tl ON tl.sport=e.sport AND tl.found AND tl.logo_url IS NOT NULL
     AND length(e.home_k)>=4
     AND (public.normalize_team_match_key(tl.team_name_original)=e.home_k
          OR public.normalize_team_match_key(tl.team_name_original) LIKE '%'||e.home_k||'%'
          OR e.home_k LIKE '%'||public.normalize_team_match_key(tl.team_name_original)||'%')
  ),
  am AS (
    SELECT e.id, tl.logo_url
    FROM evs e
    JOIN public.team_logos tl ON tl.sport=e.sport AND tl.found AND tl.logo_url IS NOT NULL
     AND length(e.away_k)>=4
     AND (public.normalize_team_match_key(tl.team_name_original)=e.away_k
          OR public.normalize_team_match_key(tl.team_name_original) LIKE '%'||e.away_k||'%'
          OR e.away_k LIKE '%'||public.normalize_team_match_key(tl.team_name_original)||'%')
  ),
  h AS (SELECT id, min(logo_url) AS logo_url FROM hm GROUP BY id HAVING count(DISTINCT logo_url)=1),
  a AS (SELECT id, min(logo_url) AS logo_url FROM am GROUP BY id HAVING count(DISTINCT logo_url)=1),
  upd AS (
    UPDATE public.daily_events de
       SET home_team_logo = COALESCE(de.home_team_logo, h.logo_url),
           away_team_logo = COALESCE(de.away_team_logo, a.logo_url)
      FROM evs e LEFT JOIN h ON h.id=e.id LEFT JOIN a ON a.id=e.id
     WHERE de.id=e.id AND (h.logo_url IS NOT NULL OR a.logo_url IS NOT NULL)
     RETURNING 1
  ) SELECT count(*) INTO updated_global FROM upd;

  RETURN jsonb_build_object(
    'exact', updated_exact,
    'alias', updated_alias,
    'relaxed', updated_relaxed,
    'global', updated_global,
    'substring', updated_relaxed,
    'total', updated_exact + updated_alias + updated_relaxed + updated_global
  );
END;
$$;

INSERT INTO public.monitored_leagues
  (sport, league_key, league_name, league_flag, continent, country, competition_type, is_active, api_sports_id, current_season)
VALUES
  ('soccer', 'soccer_paraguay_primera_division', 'Primera División', '🇵🇾', 'América do Sul', 'Paraguai', 'league', true, 250, 2024)
ON CONFLICT (league_key) DO UPDATE
SET sport = EXCLUDED.sport,
    league_name = EXCLUDED.league_name,
    league_flag = EXCLUDED.league_flag,
    continent = EXCLUDED.continent,
    country = EXCLUDED.country,
    competition_type = EXCLUDED.competition_type,
    is_active = EXCLUDED.is_active,
    api_sports_id = EXCLUDED.api_sports_id,
    current_season = EXCLUDED.current_season,
    updated_at = now();