INSERT INTO public.monitored_leagues (league_key, sport, api_sports_id, current_season, country, league_name)
VALUES
  ('basketball_wnba', 'basketball', 13, 2024, 'USA', 'WNBA'),
  ('soccer_brazil_serie_c', 'soccer', 75, 2024, 'Brazil', 'Brasileirão Série C')
ON CONFLICT (league_key) DO UPDATE SET
  api_sports_id = EXCLUDED.api_sports_id,
  current_season = EXCLUDED.current_season,
  country = EXCLUDED.country,
  league_name = EXCLUDED.league_name;