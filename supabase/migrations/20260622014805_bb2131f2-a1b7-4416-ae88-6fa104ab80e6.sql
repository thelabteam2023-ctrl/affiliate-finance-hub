
-- 1) Staging cru do Sofascore (auditoria + reprocessamento sem refazer chamada paga)
CREATE TABLE public.sofascore_events_raw (
  id BIGSERIAL PRIMARY KEY,
  source_run_id UUID,
  actor_id TEXT NOT NULL DEFAULT 'azzouzana/sofascore-scraper-pro',
  sport TEXT,
  unique_tournament_id BIGINT,
  event_id BIGINT,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sofa_raw_event ON public.sofascore_events_raw(event_id);
CREATE INDEX idx_sofa_raw_sport ON public.sofascore_events_raw(sport, fetched_at DESC);
CREATE INDEX idx_sofa_raw_run ON public.sofascore_events_raw(source_run_id);
GRANT SELECT ON public.sofascore_events_raw TO authenticated;
GRANT ALL ON public.sofascore_events_raw TO service_role;
ALTER TABLE public.sofascore_events_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read sofa raw" ON public.sofascore_events_raw
  FOR SELECT TO authenticated USING (true);

-- 2) Runs de sincronização (controle de custo / status / auditoria)
CREATE TABLE public.sofascore_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running', -- running | success | error | aborted
  triggered_by UUID,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  items_fetched INT NOT NULL DEFAULT 0,
  items_upserted INT NOT NULL DEFAULT 0,
  by_sport JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_sofa_runs_started ON public.sofascore_sync_runs(started_at DESC);
GRANT SELECT ON public.sofascore_sync_runs TO authenticated;
GRANT ALL ON public.sofascore_sync_runs TO service_role;
ALTER TABLE public.sofascore_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read sofa runs" ON public.sofascore_sync_runs
  FOR SELECT TO authenticated USING (true);

-- 3) Seeds de cobertura (start URLs do actor, gerenciáveis sem deploy)
CREATE TABLE public.sofascore_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport TEXT NOT NULL,
  label TEXT NOT NULL,
  start_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_sofa_seeds_url ON public.sofascore_seeds(start_url);
CREATE INDEX idx_sofa_seeds_sport ON public.sofascore_seeds(sport, enabled);
GRANT SELECT ON public.sofascore_seeds TO authenticated;
GRANT ALL ON public.sofascore_seeds TO service_role;
ALTER TABLE public.sofascore_seeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read seeds" ON public.sofascore_seeds
  FOR SELECT TO authenticated USING (true);

-- Bootstrap mínimo de seeds (agenda do dia por esporte; estendemos depois)
INSERT INTO public.sofascore_seeds (sport, label, start_url) VALUES
  ('soccer', 'Futebol — agenda do dia', 'https://www.sofascore.com/football'),
  ('basketball', 'Basquete — agenda do dia', 'https://www.sofascore.com/basketball'),
  ('tennis', 'Tênis — agenda do dia', 'https://www.sofascore.com/tennis'),
  ('baseball', 'Beisebol — agenda do dia', 'https://www.sofascore.com/baseball'),
  ('americanfootball', 'F. Americano — agenda do dia', 'https://www.sofascore.com/american-football'),
  ('icehockey', 'Hóquei — agenda do dia', 'https://www.sofascore.com/ice-hockey');

-- 4) Estender daily_events com source / external_ids (sem quebrar leituras atuais)
ALTER TABLE public.daily_events
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'odds_api',
  ADD COLUMN IF NOT EXISTS external_ids JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_daily_events_source_date
  ON public.daily_events(source, event_date);
CREATE INDEX IF NOT EXISTS idx_daily_events_sport_date
  ON public.daily_events(sport, event_date);

-- Garante unicidade idempotente para UPSERT por (source, api_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_events_source_api
  ON public.daily_events(source, api_id);
