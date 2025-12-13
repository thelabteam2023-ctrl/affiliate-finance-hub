-- Fase 1: Suporte a Projeto Exclusivo com Contas Próprias

-- Adicionar campos na tabela projetos
ALTER TABLE projetos 
ADD COLUMN IF NOT EXISTS investidor_id UUID REFERENCES investidores(id),
ADD COLUMN IF NOT EXISTS tipo_projeto TEXT DEFAULT 'INTERNO';

-- Adicionar constraint para tipo_projeto
ALTER TABLE projetos 
ADD CONSTRAINT projetos_tipo_projeto_check 
CHECK (tipo_projeto IN ('INTERNO', 'EXCLUSIVO_INVESTIDOR'));

-- Adicionar projeto_id na tabela investidor_deals (acordo específico por projeto)
ALTER TABLE investidor_deals 
ADD COLUMN IF NOT EXISTS projeto_id UUID REFERENCES projetos(id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_projetos_investidor_id ON projetos(investidor_id);
CREATE INDEX IF NOT EXISTS idx_projetos_tipo ON projetos(tipo_projeto);
CREATE INDEX IF NOT EXISTS idx_deals_projeto_id ON investidor_deals(projeto_id);

-- Comentários para documentação
COMMENT ON COLUMN projetos.investidor_id IS 'Investidor dono do projeto (apenas para tipo EXCLUSIVO_INVESTIDOR)';
COMMENT ON COLUMN projetos.tipo_projeto IS 'INTERNO = capital próprio da empresa, EXCLUSIVO_INVESTIDOR = capital de terceiro isolado';
COMMENT ON COLUMN investidor_deals.projeto_id IS 'Acordo específico para um projeto (null = acordo global)';