
-- 0) Extensão necessária ANTES da função
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- 1) Função de normalização
CREATE OR REPLACE FUNCTION public.normalize_team(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
    regexp_replace(
      lower(public.unaccent(coalesce(input, ''))),
      '\y(fc|cf|sc|ac|cd|sk|if|bk|hc|club|football|futbol|futebol|soccer)\y',
      '', 'g'
    ),
    '[^a-z0-9]+', '', 'g'
  );
$$;

-- 2) Renomear tabelas legadas
ALTER TABLE IF EXISTS public.sofascore_events_raw RENAME TO sports_events_raw;
ALTER TABLE IF EXISTS public.sofascore_sync_runs  RENAME TO sports_sync_runs;

-- 3) Tabela principal
CREATE TABLE IF NOT EXISTS public.sports_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key text NOT NULL UNIQUE,
  sport text NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  home_team_normalized text NOT NULL,
  away_team_normalized text NOT NULL,
  home_team_logo text,
  away_team_logo text,
  league_id text,
  league_name text,
  league_logo text,
  country text,
  continent text,
  competition_type text,
  commence_time timestamptz NOT NULL,
  event_date_brt date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  home_score integer,
  away_score integer,
  venue text,
  city text,
  primary_source text NOT NULL DEFAULT 'thesportsdb',
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sports_events_sport_date ON public.sports_events (sport, event_date_brt);
CREATE INDEX IF NOT EXISTS idx_sports_events_league     ON public.sports_events (league_id);
CREATE INDEX IF NOT EXISTS idx_sports_events_status     ON public.sports_events (status);
CREATE INDEX IF NOT EXISTS idx_sports_events_commence   ON public.sports_events (commence_time);

-- 4) GRANTs
GRANT SELECT ON public.sports_events TO authenticated;
GRANT ALL    ON public.sports_events TO service_role;

-- 5) RLS
ALTER TABLE public.sports_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sports_events"
  ON public.sports_events FOR SELECT TO authenticated USING (true);

-- 6) updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_sports_events_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS sports_events_updated_at ON public.sports_events;
CREATE TRIGGER sports_events_updated_at
  BEFORE UPDATE ON public.sports_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_sports_events_updated_at();

-- 7) Deprecação
COMMENT ON TABLE public.sofascore_seeds IS 'DEPRECATED: legado da infra Sofascore/Apify. Substituído por thesportsdb-sync.';
