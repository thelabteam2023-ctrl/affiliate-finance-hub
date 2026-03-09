
-- Table to store daily capital position snapshots
CREATE TABLE public.capital_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  capital_bookmakers_brl numeric NOT NULL DEFAULT 0,
  capital_bookmakers_usd numeric NOT NULL DEFAULT 0,
  capital_bookmakers_eur numeric NOT NULL DEFAULT 0,
  capital_bookmakers_total_brl numeric NOT NULL DEFAULT 0,
  cotacao_usd numeric NOT NULL DEFAULT 5.0,
  cotacao_eur numeric NOT NULL DEFAULT 5.5,
  volume_apostado_periodo numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, snapshot_date)
);

-- Enable RLS
ALTER TABLE public.capital_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies using workspace_members
CREATE POLICY "Users can view their workspace capital snapshots"
  ON public.capital_snapshots
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service can insert capital snapshots"
  ON public.capital_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Allow service_role to insert (for edge function cron)
CREATE POLICY "Service role can insert snapshots"
  ON public.capital_snapshots
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Index for efficient period queries
CREATE INDEX idx_capital_snapshots_workspace_date 
  ON public.capital_snapshots (workspace_id, snapshot_date DESC);
