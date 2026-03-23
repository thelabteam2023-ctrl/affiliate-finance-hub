
-- Table to store user-defined bet sources per workspace
CREATE TABLE public.workspace_bet_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, name)
);

-- Enable RLS
ALTER TABLE public.workspace_bet_sources ENABLE ROW LEVEL SECURITY;

-- RLS: users can read sources from their workspace
CREATE POLICY "Users can read workspace sources"
  ON public.workspace_bet_sources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_bet_sources.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS: users can insert sources to their workspace
CREATE POLICY "Users can insert workspace sources"
  ON public.workspace_bet_sources FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_bet_sources.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Add fonte_entrada column to apostas_unificada
ALTER TABLE public.apostas_unificada ADD COLUMN IF NOT EXISTS fonte_entrada TEXT NULL;

-- Seed default sources (will be inserted per workspace on first use via app logic)
