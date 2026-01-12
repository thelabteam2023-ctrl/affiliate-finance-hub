
-- 1. Criar nova permissão específica para alterar status (limitar/deslimitar)
INSERT INTO permissions (code, module, action, description, scope)
VALUES ('bookmakers.accounts.status', 'bookmakers', 'status', 'Alterar status da conta (limitar/deslimitar)', 'project_only')
ON CONFLICT (code) DO NOTHING;

-- 2. Atribuir permissão ao operador
INSERT INTO role_permissions (role, permission_code)
VALUES ('operator', 'bookmakers.accounts.status')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 3. Também atribuir ao finance (que já pode editar, mas para consistência)
INSERT INTO role_permissions (role, permission_code)
VALUES ('finance', 'bookmakers.accounts.status')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 4. Atribuir ao admin
INSERT INTO role_permissions (role, permission_code)
VALUES ('admin', 'bookmakers.accounts.status')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 5. Atribuir ao viewer NÃO (viewer apenas visualiza)

-- 6. Dar permissão de leitura de contas do projeto ao operador
INSERT INTO role_permissions (role, permission_code)
VALUES ('operator', 'bookmakers.accounts.read_project')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 7. Atualizar a policy de UPDATE para permitir alteração de status
-- A policy atual exige bookmakers.accounts.edit para qualquer update
-- Vamos criar uma policy mais permissiva que permite apenas alterar o campo 'status'

-- Primeiro, remover a policy atual
DROP POLICY IF EXISTS bookmakers_ws_update ON bookmakers;

-- Criar nova policy que permite:
-- - Edição completa para quem tem bookmakers.accounts.edit
-- - OU apenas alteração de status para quem tem bookmakers.accounts.status
CREATE POLICY bookmakers_ws_update ON bookmakers
FOR UPDATE
USING (
  workspace_id = get_current_workspace() 
  AND (
    has_permission(auth.uid(), 'bookmakers.accounts.edit', workspace_id)
    OR has_permission(auth.uid(), 'bookmakers.accounts.status', workspace_id)
  )
);
