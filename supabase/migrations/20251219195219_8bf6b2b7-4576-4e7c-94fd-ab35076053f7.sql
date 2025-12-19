-- CORREÇÃO: Projetos fantasmas e unicidade por workspace

-- 1. Migrar projetos sem workspace para o workspace do owner
UPDATE projetos p
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = p.user_id 
    AND wm.is_active = true
  ORDER BY wm.created_at ASC
  LIMIT 1
)
WHERE p.workspace_id IS NULL;

-- 2. Remover índice antigo (user_id, nome)
DROP INDEX IF EXISTS idx_projetos_nome_user_unique;

-- 3. Criar novo índice único por (workspace_id, nome) case-insensitive
CREATE UNIQUE INDEX idx_projetos_workspace_nome_unique 
ON projetos (workspace_id, lower(nome))
WHERE workspace_id IS NOT NULL;

-- 4. Tornar workspace_id NOT NULL para novos projetos (adicionar constraint)
-- Primeiro garantir que não há mais nulos
DO $$
BEGIN
  -- Verificar se ainda existem projetos sem workspace
  IF EXISTS (SELECT 1 FROM projetos WHERE workspace_id IS NULL) THEN
    RAISE NOTICE 'Ainda existem projetos sem workspace_id';
  ELSE
    -- Adicionar constraint NOT NULL se não houver nulos
    ALTER TABLE projetos ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;