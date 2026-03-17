CREATE POLICY "workspace_members_update_grupo_membros"
ON public.bookmaker_grupo_membros
FOR UPDATE
TO authenticated
USING (workspace_id IN (
  SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
))
WITH CHECK (workspace_id IN (
  SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
));