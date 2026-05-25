CREATE TABLE public.monitored_leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport TEXT NOT NULL,
  league_key TEXT NOT NULL UNIQUE,
  league_name TEXT NOT NULL,
  league_flag TEXT,
  continent TEXT,
  country TEXT,
  competition_type TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.monitored_leagues ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Monitored leagues are viewable by everyone" 
ON public.monitored_leagues FOR SELECT USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_monitored_leagues_updated_at
BEFORE UPDATE ON public.monitored_leagues
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();