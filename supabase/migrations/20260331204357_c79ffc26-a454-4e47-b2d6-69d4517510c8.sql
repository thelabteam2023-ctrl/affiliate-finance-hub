UPDATE cash_ledger 
SET moeda_origem = 'USD',
    updated_at = now()
WHERE id = 'da32ce27-79e7-4275-bb2c-252b355ddd66'
AND status = 'PENDENTE';