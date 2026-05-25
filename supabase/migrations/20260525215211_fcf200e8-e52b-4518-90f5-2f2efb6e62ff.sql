-- Adiciona colunas
ALTER TABLE public.monitored_leagues ADD COLUMN IF NOT EXISTS api_sports_id INTEGER;
ALTER TABLE public.monitored_leagues ADD COLUMN IF NOT EXISTS current_season INTEGER;

-- Popula IDs conhecidos
UPDATE public.monitored_leagues SET api_sports_id = 71, current_season = 2024 WHERE league_key = 'soccer_brazil_campeonato';
UPDATE public.monitored_leagues SET api_sports_id = 72, current_season = 2024 WHERE league_key = 'soccer_brazil_serie_b';
UPDATE public.monitored_leagues SET api_sports_id = 39, current_season = 2024 WHERE league_key = 'soccer_epl';
UPDATE public.monitored_leagues SET api_sports_id = 78, current_season = 2024 WHERE league_key = 'soccer_germany_bundesliga';
UPDATE public.monitored_leagues SET api_sports_id = 140, current_season = 2024 WHERE league_key = 'soccer_spain_la_liga';
UPDATE public.monitored_leagues SET api_sports_id = 135, current_season = 2024 WHERE league_key = 'soccer_italy_serie_a';
UPDATE public.monitored_leagues SET api_sports_id = 61, current_season = 2024 WHERE league_key = 'soccer_france_ligue_one';
UPDATE public.monitored_leagues SET api_sports_id = 2, current_season = 2024 WHERE league_key = 'soccer_uefa_champs_league';
UPDATE public.monitored_leagues SET api_sports_id = 13, current_season = 2024 WHERE league_key = 'soccer_conmebol_copa_libertadores';
UPDATE public.monitored_leagues SET api_sports_id = 11, current_season = 2024 WHERE league_key = 'soccer_conmebol_copa_sudamericana';
UPDATE public.monitored_leagues SET api_sports_id = 12, current_season = 2024 WHERE league_key = 'basketball_nba';
UPDATE public.monitored_leagues SET api_sports_id = 57, current_season = 2024 WHERE league_key = 'icehockey_nhl';
UPDATE public.monitored_leagues SET api_sports_id = 1, current_season = 2024 WHERE league_key = 'americanfootball_nfl';
UPDATE public.monitored_leagues SET api_sports_id = 1, current_season = 2024 WHERE league_key = 'baseball_mlb';
UPDATE public.monitored_leagues SET api_sports_id = 79, current_season = 2024 WHERE league_key = 'soccer_germany_bundesliga2';
UPDATE public.monitored_leagues SET api_sports_id = 141, current_season = 2024 WHERE league_key = 'soccer_spain_segunda_division';
UPDATE public.monitored_leagues SET api_sports_id = 253, current_season = 2024 WHERE league_key = 'soccer_usa_mls';
UPDATE public.monitored_leagues SET api_sports_id = 262, current_season = 2024 WHERE league_key = 'soccer_mexico_ligamx';
UPDATE public.monitored_leagues SET api_sports_id = 128, current_season = 2024 WHERE league_key = 'soccer_argentina_primera_division';
UPDATE public.monitored_leagues SET api_sports_id = 307, current_season = 2024 WHERE league_key = 'soccer_saudi_arabia_pro_league';
UPDATE public.monitored_leagues SET api_sports_id = 94, current_season = 2024 WHERE league_key = 'soccer_portugal_primeira_liga';
UPDATE public.monitored_leagues SET api_sports_id = 88, current_season = 2024 WHERE league_key = 'soccer_netherlands_eredivisie';
UPDATE public.monitored_leagues SET api_sports_id = 203, current_season = 2024 WHERE league_key = 'soccer_turkey_super_league';
