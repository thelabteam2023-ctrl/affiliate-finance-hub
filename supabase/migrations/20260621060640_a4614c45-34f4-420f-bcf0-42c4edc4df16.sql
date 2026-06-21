ALTER TABLE public.apostas_unificada
  ADD COLUMN IF NOT EXISTS home_team           text,
  ADD COLUMN IF NOT EXISTS away_team           text,
  ADD COLUMN IF NOT EXISTS home_team_logo_url  text,
  ADD COLUMN IF NOT EXISTS away_team_logo_url  text,
  ADD COLUMN IF NOT EXISTS league_logo_url     text,
  ADD COLUMN IF NOT EXISTS daily_event_id      uuid REFERENCES public.daily_events(id) ON DELETE SET NULL;