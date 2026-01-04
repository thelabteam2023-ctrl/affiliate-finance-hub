
-- CORREÇÃO: Políticas RLS de contas_bancarias e wallets_crypto
-- Agora verificam permissão 'parceiros.read' além do workspace

-- Dropar políticas antigas de contas_bancarias
DROP POLICY IF EXISTS "Workspace members can view bank accounts" ON contas_bancarias;
DROP POLICY IF EXISTS "Workspace members can insert bank accounts" ON contas_bancarias;
DROP POLICY IF EXISTS "Workspace members can update bank accounts" ON contas_bancarias;
DROP POLICY IF EXISTS "Workspace members can delete bank accounts" ON contas_bancarias;

-- Criar novas políticas baseadas em permissão
CREATE POLICY "Users with parceiros.read can view bank accounts"
ON contas_bancarias
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
  AND has_permission(auth.uid(), 'parceiros.read', get_current_workspace())
);

CREATE POLICY "Users with parceiros.edit can insert bank accounts"
ON contas_bancarias
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
  AND has_permission(auth.uid(), 'parceiros.edit', get_current_workspace())
);

CREATE POLICY "Users with parceiros.edit can update bank accounts"
ON contas_bancarias
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
  AND has_permission(auth.uid(), 'parceiros.edit', get_current_workspace())
);

CREATE POLICY "Users with parceiros.delete can delete bank accounts"
ON contas_bancarias
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
  AND has_permission(auth.uid(), 'parceiros.delete', get_current_workspace())
);

-- Dropar políticas antigas de wallets_crypto
DROP POLICY IF EXISTS "Workspace members can view crypto wallets" ON wallets_crypto;
DROP POLICY IF EXISTS "Workspace members can insert crypto wallets" ON wallets_crypto;
DROP POLICY IF EXISTS "Workspace members can update crypto wallets" ON wallets_crypto;
DROP POLICY IF EXISTS "Workspace members can delete crypto wallets" ON wallets_crypto;

-- Criar novas políticas baseadas em permissão
CREATE POLICY "Users with parceiros.read can view crypto wallets"
ON wallets_crypto
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
  AND has_permission(auth.uid(), 'parceiros.read', get_current_workspace())
);

CREATE POLICY "Users with parceiros.edit can insert crypto wallets"
ON wallets_crypto
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
  AND has_permission(auth.uid(), 'parceiros.edit', get_current_workspace())
);

CREATE POLICY "Users with parceiros.edit can update crypto wallets"
ON wallets_crypto
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
  AND has_permission(auth.uid(), 'parceiros.edit', get_current_workspace())
);

CREATE POLICY "Users with parceiros.delete can delete crypto wallets"
ON wallets_crypto
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.workspace_id = get_current_workspace()
  )
  AND has_permission(auth.uid(), 'parceiros.delete', get_current_workspace())
);
