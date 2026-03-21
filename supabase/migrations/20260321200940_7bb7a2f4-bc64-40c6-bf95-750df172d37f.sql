-- Reverter o ajuste incorreto que zerou a Betano do Sebasthian
-- O depósito real de R$1.500 era legítimo e não deveria ter sido zerado

-- 1. Deletar o financial_event de AJUSTE incorreto
DELETE FROM financial_events 
WHERE bookmaker_id = '5f599383-db75-49a9-b4f6-306aa1e323b1'
  AND tipo_evento = 'AJUSTE'
  AND idempotency_key = 'ledger_ajuste_saldo_e68ff421-a52d-40f6-b48e-8d8fc8dc2f33';

-- 2. Deletar o lançamento de AJUSTE_SALDO incorreto do cash_ledger
DELETE FROM cash_ledger 
WHERE id = 'e68ff421-a52d-40f6-b48e-8d8fc8dc2f33';

-- 3. Deletar o registro de audit incorreto
DELETE FROM bookmaker_balance_audit 
WHERE id = 'b3614133-854f-429a-b902-a91b11eda494';

-- 4. Restaurar o saldo correto da Betano: R$ 1.500
UPDATE bookmakers 
SET saldo_atual = 1500.00, updated_at = NOW()
WHERE id = '5f599383-db75-49a9-b4f6-306aa1e323b1';