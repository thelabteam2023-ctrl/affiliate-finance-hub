
-- Fix: triggers added deposit amounts on top of manually set balances
-- Set correct balances to match: initial set + trigger deposit = double
-- So we need to set to the correct post-deposit values
UPDATE bookmakers SET saldo_atual = 250 WHERE id = '2225697b-ae67-4449-8c2b-58a2da8989c1'; -- BETANO: dep 250
UPDATE bookmakers SET saldo_atual = 100 WHERE id = 'd5b68b0d-610d-44eb-88a9-8c405ba77b2b'; -- PLAYIO: dep 100
UPDATE bookmakers SET saldo_atual = 500 WHERE id = 'd4342e9a-c933-4661-a16d-ae7668d0d489'; -- BET365: dep 500
