-- Fix: Move balances from Glayza's accounts to José Roberto's accounts (same houses)
-- NOVIBET: Glayza (250f496c) 1200 -> 0, José Roberto (8100e3c6) 0 -> 1200
-- SUPERBET: Glayza (c5ccc53e) 200 -> 0, José Roberto (599d6d10) 0 -> 200

UPDATE supplier_bookmaker_accounts SET saldo_atual = 0, updated_at = now()
WHERE id = '250f496c-cf11-4e8e-9d0a-e846705a3360';

UPDATE supplier_bookmaker_accounts SET saldo_atual = 1200, updated_at = now()
WHERE id = '8100e3c6-c846-44eb-80ae-ef36b3aef0d5';

UPDATE supplier_bookmaker_accounts SET saldo_atual = 0, updated_at = now()
WHERE id = 'c5ccc53e-b8dc-4c22-8d8b-916d21839bcf';

UPDATE supplier_bookmaker_accounts SET saldo_atual = 200, updated_at = now()
WHERE id = '599d6d10-42aa-470c-a0d0-3adb574504d4';