
-- Zerar saldo_atual e saldo_usd de todas as bookmakers da Eduarda
-- Estes saldos são residuais de depósitos cripto que foram cancelados no ledger
-- mas cujo trigger v5 (BEFORE INSERT) não reverteu automaticamente
UPDATE bookmakers
SET saldo_atual = 0, saldo_usd = 0, updated_at = now()
WHERE parceiro_id = 'd2c1d2e1-2841-46de-8005-75f899b8d25c'
AND saldo_atual > 0;
