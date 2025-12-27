-- Adicionar permissão parceiros.read para operators
INSERT INTO role_permissions (role, permission_code) 
VALUES ('operator', 'parceiros.read')
ON CONFLICT (role, permission_code) DO NOTHING;

-- Adicionar permissão bookmakers.catalog.read para operators (para ver o catálogo de bookmakers)
INSERT INTO role_permissions (role, permission_code) 
VALUES ('operator', 'bookmakers.catalog.read')
ON CONFLICT (role, permission_code) DO NOTHING;