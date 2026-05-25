-- Adiciona coluna de país
ALTER TABLE public.team_logos ADD COLUMN IF NOT EXISTS country TEXT;

-- Atualiza a restrição de unicidade para incluir o país
-- Primeiro removemos a antiga se existir (assumindo que era sport, team_name_normalized)
ALTER TABLE public.team_logos DROP CONSTRAINT IF EXISTS team_logos_sport_team_name_normalized_key;

-- Cria um novo índice único que permite o mesmo nome em países diferentes
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_logos_lookup ON public.team_logos (sport, team_name_normalized, COALESCE(country, 'global'));

-- Adiciona uma função auxiliar para normalização de nomes no banco de dados
CREATE OR REPLACE FUNCTION public.normalize_text(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(unaccent(input_text), '[^a-zA-Z0-9]', '', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
