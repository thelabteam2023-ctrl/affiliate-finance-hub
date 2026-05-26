INSERT INTO public.monitored_leagues
  (sport, league_key, league_name, league_flag, continent, country, competition_type, is_active, api_sports_id, current_season)
VALUES
  ('soccer', 'soccer_brazil_copa_do_brasil', 'Copa do Brasil', '🇧🇷', 'América do Sul', 'Brasil', 'cup', true, 73, 2024)
ON CONFLICT (league_key) DO UPDATE
SET league_name = EXCLUDED.league_name,
    api_sports_id = EXCLUDED.api_sports_id,
    current_season = EXCLUDED.current_season,
    competition_type = EXCLUDED.competition_type,
    is_active = true,
    updated_at = now();