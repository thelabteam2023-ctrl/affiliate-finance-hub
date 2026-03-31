
-- Corrigir moeda da bookmaker BORA JOGAR (José Silva) de USD para BRL
UPDATE bookmakers 
SET moeda = 'BRL', updated_at = now()
WHERE id = 'e47d7163-fa50-4e67-aa87-105aa5bd81c3' 
AND moeda = 'USD';

-- Corrigir a transação pendente associada de USD para BRL
UPDATE cash_ledger 
SET moeda = 'BRL', moeda_origem = 'BRL', updated_at = now()
WHERE id = 'da32ce27-79e7-4275-bb2c-252b355ddd66'
AND status = 'PENDENTE'
AND moeda = 'USD';
