CREATE OR REPLACE FUNCTION public.team_logo_tokens(name text)
RETURNS text[]
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
    WHERE length(tok) >= 6
      AND tok NOT IN ('fc','cf','cd','sc','ac','club','clube','de','da','do','del','di','du','la','le','el','the')
  )
  SELECT coalesce(array_agg(tok ORDER BY tok), ARRAY[]::text[]) FROM tokens;
$$;

CREATE OR REPLACE FUNCTION public.is_safe_team_logo_match(query_name text, candidate_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH q AS (
    SELECT public.team_logo_tokens(query_name) AS tokens
  ), c AS (
    SELECT public.team_logo_tokens(candidate_name) AS tokens
  ), stats AS (
    SELECT
      q.tokens AS q_tokens,
      c.tokens AS c_tokens,
      ARRAY(SELECT unnest(q.tokens) INTERSECT SELECT unnest(c.tokens)) AS matched_tokens
    FROM q, c
  )
  SELECT CASE
    WHEN cardinality(q_tokens) = 0 OR cardinality(c_tokens) = 0 THEN false
    WHEN cardinality(matched_tokens) < LEAST(cardinality(q_tokens), cardinality(c_tokens)) THEN false
    WHEN LEAST(cardinality(q_tokens), cardinality(c_tokens)) = 1 THEN
      cardinality(matched_tokens) = 1
      AND length(matched_tokens[1]) >= 7
      AND matched_tokens[1] NOT IN (
        'athletic','atletico','sporting','racing','central','united',
        'city','real','deportivo','nacional','independiente','wanderers',
        'rangers','rovers','county','town'
      )
    ELSE true
  END
  FROM stats;
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
  updated_safe_league int := 0;
  updated_safe_global int := 0;
BEGIN
  -- 1) Match exato dentro da mesma liga.
  WITH evs AS (
    SELECT id, league_key,
           public.normalize_team_name(home_team) AS home_n,
           public.normalize_team_name(away_team) AS away_n
    FROM public.daily_events
    WHERE event_date = p_date
      AND (home_team_logo IS NULL OR away_team_logo IS NULL)
  ),
  h AS (SELECT e.id, tl.logo_url FROM evs e JOIN public.team_logos tl
        ON tl.league_key=e.league_key AND tl.team_name_normalized=e.home_n AND tl.found AND tl.logo_url IS NOT NULL),
  a AS (SELECT e.id, tl.logo_url FROM evs e JOIN public.team_logos tl
        ON tl.league_key=e.league_key AND tl.team_name_normalized=e.away_n AND tl.found AND tl.logo_url IS NOT NULL),
  upd AS (
    UPDATE public.daily_events de
       SET home_team_logo = COALESCE(de.home_team_logo, h.logo_url),
           away_team_logo = COALESCE(de.away_team_logo, a.logo_url)
      FROM evs e LEFT JOIN h ON h.id=e.id LEFT JOIN a ON a.id=e.id
     WHERE de.id=e.id AND (h.logo_url IS NOT NULL OR a.logo_url IS NOT NULL)
     RETURNING 1
  ) SELECT count(*) INTO updated_exact FROM upd;

  -- 2) Aliases manuais dentro da mesma liga.
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
        JOIN public.team_logos tl ON tl.id=al.team_logo_id AND tl.found AND tl.logo_url IS NOT NULL),
  a AS (SELECT e.id, tl.logo_url FROM evs e
        JOIN public.team_name_aliases al ON al.league_key=e.league_key AND al.alias_normalized=e.away_n
        JOIN public.team_logos tl ON tl.id=al.team_logo_id AND tl.found AND tl.logo_url IS NOT NULL),
  upd AS (
    UPDATE public.daily_events de
       SET home_team_logo = COALESCE(de.home_team_logo, h.logo_url),
           away_team_logo = COALESCE(de.away_team_logo, a.logo_url)
      FROM evs e LEFT JOIN h ON h.id=e.id LEFT JOIN a ON a.id=e.id
     WHERE de.id=e.id AND (h.logo_url IS NOT NULL OR a.logo_url IS NOT NULL)
     RETURNING 1
  ) SELECT count(*) INTO updated_alias FROM upd;

  -- 3) Match seguro dentro da mesma liga: token inteiro, distintivo e logo única.
  WITH evs AS (
    SELECT id, league_key, home_team, away_team
    FROM public.daily_events
    WHERE event_date = p_date
      AND (home_team_logo IS NULL OR away_team_logo IS NULL)
  ),
  hm AS (
    SELECT e.id, tl.logo_url
    FROM evs e
    JOIN public.team_logos tl ON tl.league_key=e.league_key AND tl.found AND tl.logo_url IS NOT NULL
     AND public.is_safe_team_logo_match(e.home_team, tl.team_name_original)
  ),
  am AS (
    SELECT e.id, tl.logo_url
    FROM evs e
    JOIN public.team_logos tl ON tl.league_key=e.league_key AND tl.found AND tl.logo_url IS NOT NULL
     AND public.is_safe_team_logo_match(e.away_team, tl.team_name_original)
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
  ) SELECT count(*) INTO updated_safe_league FROM upd;

  -- 4) Fallback global seguro: mesmo esporte e um único logo distinto.
  WITH evs AS (
    SELECT id, sport, home_team, away_team
    FROM public.daily_events
    WHERE event_date = p_date
      AND (home_team_logo IS NULL OR away_team_logo IS NULL)
  ),
  hm AS (
    SELECT e.id, tl.logo_url
    FROM evs e
    JOIN public.team_logos tl ON tl.sport=e.sport AND tl.found AND tl.logo_url IS NOT NULL
     AND (
       public.normalize_team_name(e.home_team) = tl.team_name_normalized
       OR public.is_safe_team_logo_match(e.home_team, tl.team_name_original)
     )
  ),
  am AS (
    SELECT e.id, tl.logo_url
    FROM evs e
    JOIN public.team_logos tl ON tl.sport=e.sport AND tl.found AND tl.logo_url IS NOT NULL
     AND (
       public.normalize_team_name(e.away_team) = tl.team_name_normalized
       OR public.is_safe_team_logo_match(e.away_team, tl.team_name_original)
     )
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
  ) SELECT count(*) INTO updated_safe_global FROM upd;

  RETURN jsonb_build_object(
    'exact', updated_exact,
    'alias', updated_alias,
    'safe_league', updated_safe_league,
    'safe_global', updated_safe_global,
    'substring', 0,
    'total', updated_exact + updated_alias + updated_safe_league + updated_safe_global
  );
END;
$$;