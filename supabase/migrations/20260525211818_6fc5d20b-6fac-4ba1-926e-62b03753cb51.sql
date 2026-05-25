-- Create table for team logos cache
CREATE TABLE IF NOT EXISTS public.team_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport VARCHAR(50) NOT NULL,
  team_name_normalized VARCHAR(200) NOT NULL,
  team_name_original VARCHAR(200) NOT NULL,
  api_sports_id INTEGER,
  logo_url TEXT,
  searched_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  found BOOLEAN DEFAULT false,
  UNIQUE(sport, team_name_normalized)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_team_logos_name ON public.team_logos(sport, team_name_normalized);

-- Create table for league logos cache
CREATE TABLE IF NOT EXISTS public.league_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport VARCHAR(50) NOT NULL,
  league_key VARCHAR(100) NOT NULL,
  league_name VARCHAR(200),
  api_sports_id INTEGER,
  logo_url TEXT,
  searched_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  found BOOLEAN DEFAULT false,
  UNIQUE(sport, league_key)
);

-- Add league_logo column to daily_events if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_events' AND column_name = 'league_logo') THEN
        ALTER TABLE public.daily_events ADD COLUMN league_logo TEXT;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE public.team_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_logos ENABLE ROW LEVEL SECURITY;

-- Allow public read access (assuming logos are public data)
CREATE POLICY "Public read team_logos" ON public.team_logos FOR SELECT USING (true);
CREATE POLICY "Public read league_logos" ON public.league_logos FOR SELECT USING (true);
