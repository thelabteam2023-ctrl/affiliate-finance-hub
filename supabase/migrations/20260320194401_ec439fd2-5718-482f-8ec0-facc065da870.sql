
-- Fix apostas_pernas RLS policies to use workspace_id instead of user_id
-- The current policies check au.user_id = auth.uid() which fails when
-- a different workspace member created the bet.
-- apostas_unificada uses workspace_id = get_current_workspace(), so pernas should too.

-- Drop existing policies
DROP POLICY IF EXISTS "Usuários podem ver pernas de suas apostas" ON apostas_pernas;
DROP POLICY IF EXISTS "Usuários podem inserir pernas em suas apostas" ON apostas_pernas;
DROP POLICY IF EXISTS "Usuários podem atualizar pernas de suas apostas" ON apostas_pernas;
DROP POLICY IF EXISTS "Usuários podem deletar pernas de suas apostas" ON apostas_pernas;

-- Recreate with workspace-based access (matching apostas_unificada pattern)
CREATE POLICY "Membros do workspace podem ver pernas"
  ON apostas_pernas FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM apostas_unificada au
      WHERE au.id = apostas_pernas.aposta_id
        AND au.workspace_id = get_current_workspace()
    )
  );

CREATE POLICY "Membros do workspace podem inserir pernas"
  ON apostas_pernas FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM apostas_unificada au
      WHERE au.id = apostas_pernas.aposta_id
        AND au.workspace_id = get_current_workspace()
    )
  );

CREATE POLICY "Membros do workspace podem atualizar pernas"
  ON apostas_pernas FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM apostas_unificada au
      WHERE au.id = apostas_pernas.aposta_id
        AND au.workspace_id = get_current_workspace()
    )
  );

CREATE POLICY "Membros do workspace podem deletar pernas"
  ON apostas_pernas FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM apostas_unificada au
      WHERE au.id = apostas_pernas.aposta_id
        AND au.workspace_id = get_current_workspace()
    )
  );
