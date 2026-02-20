
-- 1. Adicionar coluna workspace_id à tabela bancos (nullable para não quebrar bancos do sistema)
ALTER TABLE public.bancos ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 2. Remover política anterior (a que estava muito aberta)
DROP POLICY IF EXISTS "Authenticated users can view all banks" ON public.bancos;
DROP POLICY IF EXISTS "Users can view system banks and own banks" ON public.bancos;
DROP POLICY IF EXISTS "Users can delete own banks" ON public.bancos;
DROP POLICY IF EXISTS "Users can update own banks" ON public.bancos;
DROP POLICY IF EXISTS "bancos_ws_insert" ON public.bancos;

-- 3. Criar função security definer para verificar membership ativa no workspace
CREATE OR REPLACE FUNCTION public.is_active_workspace_member_for_bancos(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- 4. SELECT: bancos do sistema (is_system=true, workspace_id IS NULL) são visíveis para todos autenticados;
--    bancos customizados só para membros ativos do workspace que os criou
CREATE POLICY "bancos_select"
  ON public.bancos
  FOR SELECT
  TO authenticated
  USING (
    (is_system = true AND workspace_id IS NULL)
    OR
    (workspace_id IS NOT NULL AND public.is_active_workspace_member_for_bancos(workspace_id))
  );

-- 5. INSERT: apenas membros ativos do workspace, obrigatório informar workspace_id
CREATE POLICY "bancos_insert"
  ON public.bancos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_system = false
    AND workspace_id IS NOT NULL
    AND user_id = auth.uid()
    AND public.is_active_workspace_member_for_bancos(workspace_id)
  );

-- 6. UPDATE: apenas membros ativos do workspace dono do banco
CREATE POLICY "bancos_update"
  ON public.bancos
  FOR UPDATE
  TO authenticated
  USING (
    is_system = false
    AND workspace_id IS NOT NULL
    AND public.is_active_workspace_member_for_bancos(workspace_id)
  );

-- 7. DELETE: apenas membros ativos do workspace dono do banco
CREATE POLICY "bancos_delete"
  ON public.bancos
  FOR DELETE
  TO authenticated
  USING (
    is_system = false
    AND workspace_id IS NOT NULL
    AND public.is_active_workspace_member_for_bancos(workspace_id)
  );
