ALTER TABLE public.team_logos ADD COLUMN IF NOT EXISTS league_key text;

DROP INDEX IF EXISTS public.idx_team_logos_lookup;
DROP INDEX IF EXISTS public.idx_team_logos_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_logos_league_lookup
  ON public.team_logos (league_key, team_name_normalized)
  WHERE league_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_team_logos_name_sport
  ON public.team_logos (sport, team_name_normalized);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_logos_global_fallback
  ON public.team_logos (sport, team_name_normalized, COALESCE(country, 'global'::text))
  WHERE league_key IS NULL;