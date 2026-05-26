
INSERT INTO public.monitored_leagues (sport, league_key, league_name, league_flag, continent, country, competition_type, is_active, api_sports_id, current_season)
VALUES
  -- Terceiras divisões europeias (para puxar logos de times faltantes)
  ('soccer', 'soccer_germany_3_liga', '3. Liga', '🇩🇪', 'Europa', 'Alemanha', 'league', true, 80, 2024),
  ('soccer', 'soccer_france_national', 'National 1', '🇫🇷', 'Europa', 'França', 'league', true, 63, 2024),
  ('soccer', 'soccer_italy_serie_c', 'Serie C', '🇮🇹', 'Europa', 'Itália', 'league', true, 138, 2024),
  ('soccer', 'soccer_england_league_one', 'League One', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Europa', 'Inglaterra', 'league', true, 41, 2024),
  ('soccer', 'soccer_england_league_two', 'League Two', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Europa', 'Inglaterra', 'league', true, 42, 2024),
  ('soccer', 'soccer_spain_primera_federacion', 'Primera Federación', '🇪🇸', 'Europa', 'Espanha', 'league', true, 436, 2024),
  ('soccer', 'soccer_netherlands_eerste_divisie', 'Eerste Divisie', '🇳🇱', 'Europa', 'Holanda', 'league', true, 89, 2024),
  ('soccer', 'soccer_portugal_liga_2', 'Liga Portugal 2', '🇵🇹', 'Europa', 'Portugal', 'league', true, 95, 2024),
  -- Novos campeonatos sul-americanos
  ('soccer', 'soccer_uruguay_primera', 'Primera División', '🇺🇾', 'América do Sul', 'Uruguai', 'league', true, 268, 2024),
  ('soccer', 'soccer_ecuador_liga_pro', 'Liga Pro', '🇪🇨', 'América do Sul', 'Equador', 'league', true, 242, 2024),
  ('soccer', 'soccer_peru_liga_1', 'Liga 1', '🇵🇪', 'América do Sul', 'Peru', 'league', true, 281, 2024)
ON CONFLICT (league_key) DO NOTHING;
