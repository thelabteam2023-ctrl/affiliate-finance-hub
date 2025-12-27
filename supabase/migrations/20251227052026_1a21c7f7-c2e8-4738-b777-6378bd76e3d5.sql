-- Remover parceiros.read da role base de operator (agora será permissão adicional)
DELETE FROM role_permissions 
WHERE role = 'operator' AND permission_code = 'parceiros.read';

-- Remover bookmakers.catalog.read da role base de operator (agora será permissão adicional)
DELETE FROM role_permissions 
WHERE role = 'operator' AND permission_code = 'bookmakers.catalog.read';

-- Remover bookmakers.accounts.read_project também (se existir) - operadores só devem ver casas dos projetos vinculados
DELETE FROM role_permissions 
WHERE role = 'operator' AND permission_code = 'bookmakers.accounts.read_project';