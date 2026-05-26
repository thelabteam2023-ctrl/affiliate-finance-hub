
INSERT INTO public.monitored_leagues (sport, league_key, league_name, league_flag, continent, country, competition_type, is_active, api_sports_id, current_season)
VALUES
  ('soccer', 'soccer_argentina_liga_profesional', 'Liga Profesional', '🇦🇷', 'América do Sul', 'Argentina', 'league', true, 128, 2024),
  ('soccer', 'soccer_argentina_primera_nacional', 'Primera Nacional', '🇦🇷', 'América do Sul', 'Argentina', 'league', true, 129, 2024),
  ('soccer', 'soccer_argentina_copa', 'Copa Argentina', '🇦🇷', 'América do Sul', 'Argentina', 'cup', true, 130, 2024)
ON CONFLICT (league_key) DO NOTHING;
