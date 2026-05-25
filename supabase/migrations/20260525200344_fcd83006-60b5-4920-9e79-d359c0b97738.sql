-- Add new columns to daily_events
ALTER TABLE public.daily_events 
ADD COLUMN IF NOT EXISTS continent TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS competition_type TEXT;

-- Create indexes for the new columns to improve filtering performance
CREATE INDEX IF NOT EXISTS idx_daily_events_continent ON public.daily_events(continent);
CREATE INDEX IF NOT EXISTS idx_daily_events_country ON public.daily_events(country);
CREATE INDEX IF NOT EXISTS idx_daily_events_competition_type ON public.daily_events(competition_type);
