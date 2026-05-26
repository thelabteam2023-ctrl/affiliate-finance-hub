
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.team_name_aliases (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  league_key       text NOT NULL,
  alias_normalized text NOT NULL,
  team_logo_id     uuid REFERENCES public.team_logos(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (league_key, alias_normalized)
);

CREATE INDEX IF NOT EXISTS idx_aliases_lookup
  ON public.team_name_aliases (league_key, alias_normalized);

ALTER TABLE public.team_name_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read team_name_aliases"
  ON public.team_name_aliases FOR SELECT USING (true);

CREATE POLICY "System owners manage team_name_aliases"
  ON public.team_name_aliases FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_system_owner = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_system_owner = true));

ALTER TABLE public.team_logos
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS country    text;
