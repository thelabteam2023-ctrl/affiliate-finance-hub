
-- Drop the restrictive UPDATE policy
DROP POLICY IF EXISTS "Requerente ou executor podem atualizar solicitação" ON public.solicitacoes;

-- Create a new UPDATE policy that also allows workspace admins/owners
CREATE POLICY "Membros autorizados podem atualizar solicitação"
ON public.solicitacoes
FOR UPDATE
TO authenticated
USING (
  is_workspace_member_active(auth.uid(), workspace_id)
  AND (
    requerente_id = auth.uid()
    OR executor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = solicitacoes.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'master')
        AND wm.is_active = true
    )
  )
);
