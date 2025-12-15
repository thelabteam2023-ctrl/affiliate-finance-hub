-- ============================================
-- REMOÇÃO COMPLETA DO TIPO EXCLUSIVO_INVESTIDOR
-- ============================================

-- 1. Atualizar projetos existentes para INTERNO (se houver)
UPDATE projetos SET tipo_projeto = 'INTERNO', investidor_id = NULL WHERE tipo_projeto = 'EXCLUSIVO_INVESTIDOR';

-- 2. Remover constraint existente do tipo_projeto
ALTER TABLE projetos DROP CONSTRAINT IF EXISTS projetos_tipo_projeto_check;

-- 3. Adicionar nova constraint que só aceita INTERNO
ALTER TABLE projetos ADD CONSTRAINT projetos_tipo_projeto_check CHECK (tipo_projeto = 'INTERNO');

-- 4. Definir default e atualizar todos para INTERNO
ALTER TABLE projetos ALTER COLUMN tipo_projeto SET DEFAULT 'INTERNO';
UPDATE projetos SET tipo_projeto = 'INTERNO' WHERE tipo_projeto IS NULL;

-- 5. Remover coluna investidor_id da tabela projetos (não é mais necessária)
ALTER TABLE projetos DROP COLUMN IF EXISTS investidor_id;

-- 6. Remover índice de tipo_projeto (não é mais necessário para valor fixo)
DROP INDEX IF EXISTS idx_projetos_tipo;
DROP INDEX IF EXISTS idx_projetos_investidor_id;

-- 7. Dropar a tabela projeto_acordos completamente (só era usada para projetos exclusivos)
DROP TABLE IF EXISTS projeto_acordos CASCADE;

-- 8. Remover projeto_id de investidor_deals (acordos específicos por projeto)
ALTER TABLE investidor_deals DROP COLUMN IF EXISTS projeto_id;
DROP INDEX IF EXISTS idx_deals_projeto_id;