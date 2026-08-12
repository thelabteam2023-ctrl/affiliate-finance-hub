-- REGULARIZAÇÃO FINAL DE SALDO: SMAN 365
-- O saldo atual está em +1422.44 porque o trigger fn_financial_events_sync_balance rodou no DELETE, 
-- adicionando 1422.44 (inverso do valor negativo removido), e depois rodamos um UPDATE manual somando mais 1422.44.
-- O objetivo é que o saldo reflita EXATAMENTE o efeito do evento 'LOSS' de -1422.44 que deixamos ativo.

UPDATE bookmakers 
SET saldo_atual = -1422.44 
WHERE id = '50808c70-f697-4a5d-9812-b04cd7a41225';
