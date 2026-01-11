-- Adicionar campos para gestão de estoque de freebets
ALTER TABLE freebets_recebidas 
  ADD COLUMN IF NOT EXISTS data_validade TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS qualificadora_id UUID REFERENCES apostas_unificada(id);

-- Comentários para documentação
COMMENT ON COLUMN freebets_recebidas.data_validade IS 'Data de expiração da freebet';
COMMENT ON COLUMN freebets_recebidas.origem IS 'Origem da freebet: MANUAL, QUALIFICADORA, PROMOCAO';
COMMENT ON COLUMN freebets_recebidas.qualificadora_id IS 'Referência à aposta qualificadora que gerou a freebet';