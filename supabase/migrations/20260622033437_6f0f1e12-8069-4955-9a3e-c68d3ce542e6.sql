
-- 1) league_aliases
CREATE TABLE IF NOT EXISTS public.league_aliases (
  raw_name text PRIMARY KEY,
  canonical_name text NOT NULL,
  sport text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.league_aliases TO anon, authenticated;
GRANT ALL ON public.league_aliases TO service_role;
ALTER TABLE public.league_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "league_aliases readable" ON public.league_aliases;
CREATE POLICY "league_aliases readable" ON public.league_aliases FOR SELECT USING (true);

INSERT INTO public.league_aliases (raw_name, canonical_name, sport) VALUES
  ('FIFA World Cup', 'Copa do Mundo', 'Futebol'),
  ('World Cup', 'Copa do Mundo', 'Futebol'),
  ('FIFA Club World Cup', 'Mundial de Clubes', 'Futebol')
ON CONFLICT (raw_name) DO NOTHING;

-- 2) daily_events: fixture_key + recompute event_date local + apply aliases
ALTER TABLE public.daily_events ADD COLUMN IF NOT EXISTS fixture_key text;
ALTER TABLE public.daily_events ADD COLUMN IF NOT EXISTS league_name_raw text;

-- Save raw name then apply canonical
UPDATE public.daily_events de
SET league_name_raw = COALESCE(de.league_name_raw, de.league_name),
    league_name = COALESCE(la.canonical_name, de.league_name)
FROM (SELECT raw_name, canonical_name FROM public.league_aliases) la
WHERE de.league_name = la.raw_name;

-- Recompute event_date to America/Sao_Paulo local date
UPDATE public.daily_events
SET event_date = (commence_time AT TIME ZONE 'America/Sao_Paulo')::date
WHERE event_date IS DISTINCT FROM (commence_time AT TIME ZONE 'America/Sao_Paulo')::date;

-- Compute fixture_key
UPDATE public.daily_events
SET fixture_key = lower(coalesce(sport,'')) || '|' ||
                  to_char(date_trunc('minute', commence_time) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI') || '|' ||
                  lower(coalesce(home_team,'')) || '|' ||
                  lower(coalesce(away_team,''))
WHERE fixture_key IS NULL OR fixture_key = '';

-- Consolidate duplicates: keep the row with most logos populated, then earliest created
WITH ranked AS (
  SELECT id, fixture_key,
    row_number() OVER (
      PARTITION BY fixture_key
      ORDER BY
        ((home_team_logo IS NOT NULL)::int + (away_team_logo IS NOT NULL)::int + (league_logo IS NOT NULL)::int) DESC,
        created_at ASC
    ) AS rn
  FROM public.daily_events
  WHERE fixture_key IS NOT NULL
)
DELETE FROM public.daily_events d
USING ranked r
WHERE d.id = r.id AND r.rn > 1;

ALTER TABLE public.daily_events ALTER COLUMN fixture_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS daily_events_fixture_key_uniq ON public.daily_events(fixture_key);
CREATE INDEX IF NOT EXISTS daily_events_event_date_idx ON public.daily_events(event_date);

-- Trigger to keep fixture_key + event_date consistent on writes
CREATE OR REPLACE FUNCTION public.daily_events_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_canonical text;
BEGIN
  -- Apply league alias if present
  IF NEW.league_name IS NOT NULL THEN
    SELECT canonical_name INTO v_canonical FROM public.league_aliases WHERE raw_name = NEW.league_name;
    IF v_canonical IS NOT NULL THEN
      NEW.league_name_raw := COALESCE(NEW.league_name_raw, NEW.league_name);
      NEW.league_name := v_canonical;
    END IF;
  END IF;

  -- Normalize event_date to America/Sao_Paulo
  IF NEW.commence_time IS NOT NULL THEN
    NEW.event_date := (NEW.commence_time AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;

  -- Compute fixture_key
  NEW.fixture_key := lower(coalesce(NEW.sport,'')) || '|' ||
                     to_char(date_trunc('minute', NEW.commence_time) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI') || '|' ||
                     lower(coalesce(NEW.home_team,'')) || '|' ||
                     lower(coalesce(NEW.away_team,''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_events_normalize ON public.daily_events;
CREATE TRIGGER trg_daily_events_normalize
BEFORE INSERT OR UPDATE ON public.daily_events
FOR EACH ROW EXECUTE FUNCTION public.daily_events_normalize();
