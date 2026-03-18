
-- 1. Excluir eventos da ocorrência
DELETE FROM ocorrencias_eventos WHERE ocorrencia_id = 'fe0c55ed-c351-4db3-8026-7a6ad95555bd';

-- 2. Excluir a ocorrência
DELETE FROM ocorrencias WHERE id = 'fe0c55ed-c351-4db3-8026-7a6ad95555bd';

-- 3. Excluir o lançamento de perda do ledger
DELETE FROM cash_ledger WHERE id = '8593b302-ea0d-461a-9ec6-b2b8bd5f58e4';

-- 4. Restaurar saldo da bookmaker BET365 para 500
UPDATE bookmakers SET saldo_atual = 500.00 WHERE id = '53b2e61c-8c90-4033-83b6-9eafa85c6db9';
