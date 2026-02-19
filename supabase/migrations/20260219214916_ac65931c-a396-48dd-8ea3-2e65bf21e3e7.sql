-- RLS DELETE para ocorrências (apenas owner/admin do workspace)
CREATE POLICY "Admins podem excluir ocorrências do workspace"
ON public.ocorrencias
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = ocorrencias.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin', 'master')
      AND wm.is_active = true
  )
);

-- RLS DELETE para solicitações (apenas owner/admin do workspace)
CREATE POLICY "Admins podem excluir solicitações do workspace"
ON public.solicitacoes
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = solicitacoes.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin', 'master')
      AND wm.is_active = true
  )
);