
-- Create INSERT policy for apostas_unificada
-- This policy allows authenticated users to insert bets in their current workspace

CREATE POLICY "apostas_unificada_insert" 
ON public.apostas_unificada 
FOR INSERT 
TO public
WITH CHECK (
  -- User must be authenticated
  auth.uid() IS NOT NULL
  -- And the workspace_id must match the user's current workspace
  AND workspace_id = get_current_workspace()
  -- And the user_id must be the authenticated user
  AND user_id = auth.uid()
);
