
-- CORREÇÃO CRÍTICA: Políticas RLS de contas_bancarias e wallets_crypto
-- O problema: As políticas atuais usam parceiros.user_id = auth.uid()
-- Isso impede administradores e outros membros do workspace de ver/gerenciar dados

-- Dropar políticas antigas de contas_bancarias
DROP POLICY IF EXISTS "Users can view own bank accounts" ON contas_bancarias;
DROP POLICY IF EXISTS "Users can insert own bank accounts" ON contas_bancarias;
DROP POLICY IF EXISTS "Users can update own bank accounts" ON contas_bancarias;
DROP POLICY IF EXISTS "Users can delete own bank accounts" ON contas_bancarias;

-- Criar novas políticas baseadas em workspace (através do parceiro)
CREATE POLICY "Workspace members can view bank accounts"
ON contas_bancarias
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
);

CREATE POLICY "Workspace members can insert bank accounts"
ON contas_bancarias
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
);

CREATE POLICY "Workspace members can update bank accounts"
ON contas_bancarias
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
);

CREATE POLICY "Workspace members can delete bank accounts"
ON contas_bancarias
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
);

-- Dropar políticas antigas de wallets_crypto
DROP POLICY IF EXISTS "Users can view own crypto wallets" ON wallets_crypto;
DROP POLICY IF EXISTS "Users can insert own crypto wallets" ON wallets_crypto;
DROP POLICY IF EXISTS "Users can update own crypto wallets" ON wallets_crypto;
DROP POLICY IF EXISTS "Users can delete own crypto wallets" ON wallets_crypto;

-- Criar novas políticas baseadas em workspace (através do parceiro)
CREATE POLICY "Workspace members can view crypto wallets"
ON wallets_crypto
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
);

CREATE POLICY "Workspace members can insert crypto wallets"
ON wallets_crypto
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
);

CREATE POLICY "Workspace members can update crypto wallets"
ON wallets_crypto
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
);

CREATE POLICY "Workspace members can delete crypto wallets"
ON wallets_crypto
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
);
