
-- Table for limitation events (immutable historical records)
CREATE TABLE public.limitation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Event data
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Bet counts at time of limitation
  total_bets_before_limitation INT NOT NULL DEFAULT 0,
  project_bets_before_limitation INT NOT NULL DEFAULT 0,
  
  -- Type of limitation
  limitation_type TEXT NOT NULL DEFAULT 'unknown' CHECK (limitation_type IN ('stake_limit', 'odds_limit', 'market_block', 'full_limit', 'unknown')),
  
  -- Auto-classified bucket
  limitation_bucket TEXT NOT NULL GENERATED ALWAYS AS (
    CASE 
      WHEN total_bets_before_limitation <= 5 THEN 'early'
      WHEN total_bets_before_limitation <= 10 THEN 'mid'
      ELSE 'late'
    END
  ) STORED,
  
  -- Optional notes
  observacoes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.limitation_events ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view limitation events in their workspace"
  ON public.limitation_events FOR SELECT
  USING (workspace_id IN (
    SELECT w.id FROM workspaces w
    INNER JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert limitation events in their workspace"
  ON public.limitation_events FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT w.id FROM workspaces w
    INNER JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their own limitation events"
  ON public.limitation_events FOR DELETE
  USING (user_id = auth.uid());

-- Indexes for analytics queries
CREATE INDEX idx_limitation_events_bookmaker ON public.limitation_events(bookmaker_id);
CREATE INDEX idx_limitation_events_projeto ON public.limitation_events(projeto_id);
CREATE INDEX idx_limitation_events_workspace ON public.limitation_events(workspace_id);

-- Materialized view for aggregated stats per bookmaker per project
CREATE OR REPLACE VIEW public.v_limitation_stats AS
SELECT
  le.workspace_id,
  le.bookmaker_id,
  b.nome AS bookmaker_nome,
  bc.logo_url,
  le.projeto_id,
  p.nome AS projeto_nome,
  
  -- Core metrics
  COUNT(*) AS total_events,
  ROUND(AVG(le.total_bets_before_limitation), 1) AS avg_bets_before_limitation,
  
  -- Bucket distribution
  COUNT(*) FILTER (WHERE le.limitation_bucket = 'early') AS early_count,
  COUNT(*) FILTER (WHERE le.limitation_bucket = 'mid') AS mid_count,
  COUNT(*) FILTER (WHERE le.limitation_bucket = 'late') AS late_count,
  
  ROUND(100.0 * COUNT(*) FILTER (WHERE le.limitation_bucket = 'early') / NULLIF(COUNT(*), 0), 1) AS early_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE le.limitation_bucket = 'mid') / NULLIF(COUNT(*), 0), 1) AS mid_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE le.limitation_bucket = 'late') / NULLIF(COUNT(*), 0), 1) AS late_pct,
  
  -- Most common limitation type
  MODE() WITHIN GROUP (ORDER BY le.limitation_type) AS most_common_type,
  
  -- Last limitation
  MAX(le.event_timestamp) AS last_limitation_at,
  
  -- Strategic profile (derived)
  CASE
    WHEN COUNT(*) FILTER (WHERE le.limitation_bucket = 'early') * 2 > COUNT(*) THEN 'early_limiter'
    WHEN COUNT(*) FILTER (WHERE le.limitation_bucket = 'mid') * 2 > COUNT(*) THEN 'mid_limiter'
    WHEN COUNT(*) FILTER (WHERE le.limitation_bucket = 'late') * 2 > COUNT(*) THEN 'late_limiter'
    ELSE 'low_risk'
  END AS strategic_profile

FROM public.limitation_events le
JOIN public.bookmakers b ON b.id = le.bookmaker_id
LEFT JOIN public.bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
JOIN public.projetos p ON p.id = le.projeto_id
GROUP BY le.workspace_id, le.bookmaker_id, b.nome, bc.logo_url, le.projeto_id, p.nome;
