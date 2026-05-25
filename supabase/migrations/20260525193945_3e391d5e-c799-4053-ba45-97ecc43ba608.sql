-- Create table for daily events
CREATE TABLE public.daily_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id VARCHAR(100) UNIQUE NOT NULL,
    sport VARCHAR(50) NOT NULL,
    league_key VARCHAR(100) NOT NULL,
    league_name VARCHAR(200) NOT NULL,
    league_flag VARCHAR(10),
    home_team VARCHAR(200) NOT NULL,
    away_team VARCHAR(200) NOT NULL,
    commence_time TIMESTAMPTZ NOT NULL,
    event_date DATE NOT NULL,
    result_home VARCHAR(20),
    result_away VARCHAR(20),
    status VARCHAR(20) DEFAULT 'scheduled',
    synced_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_events ENABLE ROW LEVEL SECURITY;

-- Create policies for system owners
CREATE POLICY "System owners can do everything on daily_events"
    ON public.daily_events
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_system_owner = true
        )
    );

-- Create indexes for performance
CREATE INDEX idx_daily_events_date ON public.daily_events(event_date);
CREATE INDEX idx_daily_events_sport_date ON public.daily_events(sport, event_date);
CREATE INDEX idx_daily_events_league_date ON public.daily_events(league_key, event_date);
CREATE INDEX idx_daily_events_commence_time ON public.daily_events(commence_time);

-- Create a view for league counts to simplify frontend queries
CREATE OR REPLACE VIEW public.league_game_counts AS
SELECT 
    sport,
    event_date,
    league_key, 
    league_name, 
    league_flag, 
    COUNT(*) as game_count
FROM public.daily_events
GROUP BY sport, event_date, league_key, league_name, league_flag;

-- Add comment explaining usage
COMMENT ON TABLE public.daily_events IS 'Stores matches from external APIs to reduce credit consumption.';
