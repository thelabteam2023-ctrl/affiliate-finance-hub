
-- Fix cross-workspace data leak on stablecoin_correction_log
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow read for workspace members" ON public.stablecoin_correction_log;

-- Create workspace-scoped SELECT policy via cash_ledger join
CREATE POLICY "Workspace members can read correction logs"
  ON public.stablecoin_correction_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cash_ledger cl
      JOIN public.workspace_members wm ON wm.workspace_id = cl.workspace_id
      WHERE cl.id = stablecoin_correction_log.cash_ledger_id
        AND wm.user_id = auth.uid()
    )
  );
