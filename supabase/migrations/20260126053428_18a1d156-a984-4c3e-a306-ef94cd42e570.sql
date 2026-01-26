-- Migração: Normalizar timestamps de apostas para formato local (sem timezone)
-- Remove o offset UTC (+00) mantendo o valor literal da hora

-- 1. Atualizar data_aposta removendo timezone info
-- Como o banco está em UTC e os usuários estão em BRT (UTC-3),
-- precisamos ajustar as horas antigas que foram convertidas para UTC

-- Primeiro, vamos verificar e atualizar apenas registros que têm o offset +00
UPDATE apostas_unificada
SET data_aposta = (data_aposta AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::timestamp::timestamptz
WHERE data_aposta IS NOT NULL;

-- Também atualizar apostas_pernas se houver timestamps lá
-- (verificando se há coluna de data relevante)

COMMENT ON COLUMN apostas_unificada.data_aposta IS 'Data/hora da aposta em horário local do Brasil (America/Sao_Paulo). Formato: YYYY-MM-DDTHH:mm:ss sem offset.';