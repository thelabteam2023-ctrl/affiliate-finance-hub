CREATE POLICY "Users can update workspace sources"
ON public.workspace_bet_sources
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_bet_sources.workspace_id
      AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_bet_sources.workspace_id
      AND wm.user_id = auth.uid()
  )
);