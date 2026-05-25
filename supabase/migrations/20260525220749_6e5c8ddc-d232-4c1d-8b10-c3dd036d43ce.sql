
-- Trocar índice parcial por UNIQUE constraint regular (PostgREST upsert exige)
DROP INDEX IF EXISTS public.idx_team_logos_league_lookup;
DROP INDEX IF EXISTS public.idx_team_logos_global_fallback;

-- Limpa lixo antigo sem league_key
DELETE FROM public.team_logos WHERE league_key IS NULL;

ALTER TABLE public.team_logos ALTER COLUMN league_key SET NOT NULL;

ALTER TABLE public.team_logos
  ADD CONSTRAINT team_logos_league_team_unique UNIQUE (league_key, team_name_normalized);

-- Atualizar current_season para valores corretos (2026 é a temporada em curso)
-- Ligas por ano-calendário (Américas): 2026
UPDATE public.monitored_leagues SET current_season = 2026
  WHERE sport = 'soccer' AND country IN ('Brasil','Argentina','EUA','Chile','China','México','Colômbia','Uruguai','Paraguai','Peru','Equador','Venezuela','Bolívia','Estados Unidos');
UPDATE public.monitored_leagues SET current_season = 2026
  WHERE sport IN ('baseball') AND country IN ('EUA','México','Coreia do Sul','Japão');

-- Ligas europeias (temporada cruzada): 2025 representa 2025-26
UPDATE public.monitored_leagues SET current_season = 2025
  WHERE sport = 'soccer' AND country IN ('Alemanha','Inglaterra','Espanha','Itália','França','Portugal','Holanda','Bélgica','Turquia','Arábia Saudita','Escócia','Áustria','Suíça','Grécia','Continental');
UPDATE public.monitored_leagues SET current_season = 2025
  WHERE sport IN ('basketball','icehockey','americanfootball');
