-- Adicionar campo moeda_padrao na tabela bookmakers_catalogo
ALTER TABLE bookmakers_catalogo 
ADD COLUMN moeda_padrao TEXT NOT NULL DEFAULT 'USD';

-- Atualizar registros existentes baseado no status
-- REGULAMENTADA = BRL (Real Brasileiro)
-- NAO_REGULAMENTADA = USD (Dólar Americano - padrão)
UPDATE bookmakers_catalogo 
SET moeda_padrao = 'BRL' 
WHERE status = 'REGULAMENTADA';

UPDATE bookmakers_catalogo 
SET moeda_padrao = 'USD' 
WHERE status = 'NAO_REGULAMENTADA';