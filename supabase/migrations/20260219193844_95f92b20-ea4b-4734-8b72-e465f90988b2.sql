
-- Permitir que membros ativos de um workspace vejam os perfis dos colegas
CREATE POLICY "Membros podem ver perfis de colegas do workspace"
  ON public.profiles
  FOR SELECT
  USING (
    -- Próprio perfil (mantém a policy existente também)
    auth.uid() = id
    OR
    -- Ou é colega de algum workspace em comum
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm1
      JOIN public.workspace_members wm2
        ON wm1.workspace_id = wm2.workspace_id
      WHERE wm1.user_id = auth.uid()
        AND wm2.user_id = profiles.id
        AND wm1.is_active = true
        AND wm2.is_active = true
    )
  );
