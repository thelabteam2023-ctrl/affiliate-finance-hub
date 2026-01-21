-- Adicionar flag de rollover para freebets
ALTER TABLE freebets_recebidas 
ADD COLUMN IF NOT EXISTS tem_rollover boolean DEFAULT false;

-- Adicionar flag de rollover para cashback manual
ALTER TABLE cashback_manual 
ADD COLUMN IF NOT EXISTS tem_rollover boolean DEFAULT false;

-- Comentários para documentação
COMMENT ON COLUMN freebets_recebidas.tem_rollover IS 'Indica se após uso da freebet, o lucro exigirá cumprimento de rollover antes de saque';
COMMENT ON COLUMN cashback_manual.tem_rollover IS 'Indica se o cashback creditado exige cumprimento de rollover antes de saque';