-- Remover a CHECK CONSTRAINT restritiva de categoria
-- Permitir categorias dinâmicas (modelo escalável)
ALTER TABLE despesas_administrativas DROP CONSTRAINT IF EXISTS despesas_administrativas_categoria_check;

-- Adicionar constraint básica apenas para evitar valores vazios
ALTER TABLE despesas_administrativas ADD CONSTRAINT despesas_administrativas_categoria_not_empty 
CHECK (categoria IS NOT NULL AND length(trim(categoria)) > 0);