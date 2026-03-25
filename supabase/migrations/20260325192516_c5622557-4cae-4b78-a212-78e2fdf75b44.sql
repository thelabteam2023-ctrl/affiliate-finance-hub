-- Fix: Reassign 2 ledger entries from Glayza's accounts to José Roberto's accounts
-- Entry 5e4592f6 (R$200 SUPERBET Glayza c5ccc53e) -> José Roberto SUPERBET 599d6d10
UPDATE supplier_ledger 
SET bookmaker_account_id = '599d6d10-42aa-470c-a0d0-3adb574504d4',
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{corrigido_de}',
      '"c5ccc53e-b8dc-4c22-8d8b-916d21839bcf"'
    )
WHERE id = '5e4592f6-bb4c-45b8-a7e0-84c69f68652c';

-- Entry 9c27834d (R$1200 NOVIBET Glayza 250f496c) -> José Roberto NOVIBET 8100e3c6
UPDATE supplier_ledger 
SET bookmaker_account_id = '8100e3c6-c846-44eb-80ae-ef36b3aef0d5',
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{corrigido_de}',
      '"250f496c-cf11-4e8e-9d0a-e846705a3360"'
    )
WHERE id = '9c27834d-baf9-4b22-988f-956139dc0e9b';