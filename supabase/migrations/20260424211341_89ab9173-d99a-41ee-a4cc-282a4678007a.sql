ALTER TABLE public.exchange_rate_cache
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS failure_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT;

UPDATE public.exchange_rate_cache
SET last_success_at = COALESCE(last_success_at, fetched_at),
    status = COALESCE(NULLIF(status, ''), 'active')
WHERE last_success_at IS NULL OR status IS NULL OR status = '';

CREATE TABLE IF NOT EXISTS public.exchange_rate_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  currency_pair TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  refresh_reason TEXT NOT NULL DEFAULT 'on_demand',
  is_fallback BOOLEAN NOT NULL DEFAULT false,
  provider_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchange_rate_history_pair_fetched
  ON public.exchange_rate_history(currency_pair, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_exchange_rate_history_source
  ON public.exchange_rate_history(source);

ALTER TABLE public.exchange_rate_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'exchange_rate_history'
      AND policyname = 'Histórico de cotações é público para leitura'
  ) THEN
    CREATE POLICY "Histórico de cotações é público para leitura"
    ON public.exchange_rate_history
    FOR SELECT
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'exchange_rate_history'
      AND policyname = 'Service role pode gerenciar histórico de cotações'
  ) THEN
    CREATE POLICY "Service role pode gerenciar histórico de cotações"
    ON public.exchange_rate_history
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-exchange-rates-active-fallback') THEN
    PERFORM cron.unschedule('refresh-exchange-rates-active-fallback');
  END IF;
END $$;

SELECT cron.schedule(
  'refresh-exchange-rates-active-fallback',
  '0 8,12,16,20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kxfkmritrhpkgmwlxcft.supabase.co/functions/v1/get-exchange-rates',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Imt4Zmttcml0cmhwa2dtd2x4Y2Z0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzNTQxMDMsImV4cCI6MjA3OTkzMDEwM30.Kg5U9NCvaqRgmd6SJcfDidFURdfmQ0CCaNgXZupJcNc"}'::jsonb,
    body := jsonb_build_object('reason', 'scheduled', 'forceRefresh', true)
  ) AS request_id;
  $$
);

COMMENT ON TABLE public.exchange_rate_history IS 'Histórico auditável de cotações válidas obtidas das fontes externas.';
COMMENT ON COLUMN public.exchange_rate_cache.status IS 'Estado de saúde da cotação atual: active, stale, degraded ou critical.';
COMMENT ON COLUMN public.exchange_rate_cache.failure_count IS 'Número de falhas consecutivas desde a última cotação válida.';
COMMENT ON COLUMN public.exchange_rate_cache.last_success_at IS 'Último momento em que uma cotação válida foi obtida.';