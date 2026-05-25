-- Create table for detailed API request logs
CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name        VARCHAR(50) NOT NULL,     -- 'odds_api' | 'api_football'
  endpoint        VARCHAR(300) NOT NULL,    -- URL called
  sport_key       VARCHAR(100),             -- e.g., 'soccer_epl'
  method          VARCHAR(10) DEFAULT 'GET',
  status_code     INTEGER,                  -- 200, 429, 500...
  credits_used    INTEGER DEFAULT 1,        -- credits consumed in this call
  records_returned INTEGER DEFAULT 0,       -- number of records returned
  records_saved   INTEGER DEFAULT 0,        -- number of records saved to DB
  duration_ms     INTEGER,                  -- response time in ms
  error_message   TEXT,                     -- NULL if success
  triggered_by    VARCHAR(50) DEFAULT 'cron', -- 'cron' | 'manual'
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Create table for consolidated usage counters
CREATE TABLE IF NOT EXISTS public.api_usage_summary (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name    VARCHAR(50) NOT NULL,
  period_type VARCHAR(10) NOT NULL,  -- 'day' | 'month'
  period_key  VARCHAR(20) NOT NULL,  -- '2026-05-25' | '2026-05'
  total_calls INTEGER DEFAULT 0,
  total_credits INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(api_name, period_type, period_key)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_api_name ON api_request_logs(api_name, created_at DESC);

-- Enable RLS
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_summary ENABLE ROW LEVEL SECURITY;

-- Policies: Only system owners can view these logs
CREATE POLICY "System owners can view API logs" 
ON public.api_request_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_system_owner = true
  )
);

CREATE POLICY "System owners can view API usage summary" 
ON public.api_usage_summary 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_system_owner = true
  )
);
