-- ================================================
-- CORREÇÃO DE PERMISSÕES DE BOOKMAKERS
-- Adicionar permissões granulares de accounts (vínculos)
-- ================================================

-- 1. Inserir novas permissões de accounts
INSERT INTO permissions (code, module, action, scope, description) VALUES
  ('bookmakers.accounts.create', 'bookmakers', 'create', 'global', 'Criar vínculo parceiro-casa (nova conta)'),
  ('bookmakers.accounts.edit', 'bookmakers', 'edit', 'global', 'Editar vínculo parceiro-casa'),
  ('bookmakers.accounts.delete', 'bookmakers', 'delete', 'global', 'Excluir vínculo parceiro-casa')
ON CONFLICT (code) DO NOTHING;

-- 2. Associar novas permissões às roles apropriadas
-- Admin recebe todas as permissões de accounts
INSERT INTO role_permissions (role, permission_code) VALUES
  ('admin', 'bookmakers.accounts.create'),
  ('admin', 'bookmakers.accounts.edit'),
  ('admin', 'bookmakers.accounts.delete')
ON CONFLICT (role, permission_code) DO NOTHING;

-- Finance recebe create e edit (não delete)
INSERT INTO role_permissions (role, permission_code) VALUES
  ('finance', 'bookmakers.accounts.create'),
  ('finance', 'bookmakers.accounts.edit')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 3. Garantir que permissão de catálogo existe para criar bookmakers no catálogo
INSERT INTO permissions (code, module, action, scope, description) VALUES
  ('bookmakers.catalog.create', 'bookmakers', 'create', 'global', 'Criar bookmaker no catálogo'),
  ('bookmakers.catalog.edit', 'bookmakers', 'edit', 'global', 'Editar bookmaker no catálogo'),
  ('bookmakers.catalog.delete', 'bookmakers', 'delete', 'global', 'Excluir bookmaker do catálogo')
ON CONFLICT (code) DO NOTHING;

-- Associar permissões de catálogo (apenas admin, pois catálogo é mais sensível)
INSERT INTO role_permissions (role, permission_code) VALUES
  ('admin', 'bookmakers.catalog.create'),
  ('admin', 'bookmakers.catalog.edit'),
  ('admin', 'bookmakers.catalog.delete')
ON CONFLICT (role, permission_code) DO NOTHING;