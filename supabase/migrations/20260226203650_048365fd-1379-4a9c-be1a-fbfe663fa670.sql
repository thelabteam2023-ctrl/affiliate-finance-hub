-- Update default to new unified type
ALTER TABLE ocorrencias ALTER COLUMN tipo SET DEFAULT 'movimentacao_financeira'::ocorrencia_tipo;

-- Migrate any existing data
UPDATE ocorrencias SET tipo = 'movimentacao_financeira' WHERE tipo IN ('saques', 'depositos', 'financeiro');