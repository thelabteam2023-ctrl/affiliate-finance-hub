-- Backfill metadata for existing supplier_ledger entries with banco_id
-- José Roberto's DEPOSITO/SAQUE entries -> banco MERCADO PAGO
UPDATE supplier_ledger SET metadata = jsonb_build_object('banco_id', 'ee7f7385-34e8-4357-9bb0-cf830d324670', 'banco_nome', 'MERCADO PAGO')
WHERE tipo IN ('DEPOSITO', 'SAQUE')
AND bookmaker_account_id IN (
  SELECT id FROM supplier_bookmaker_accounts WHERE titular_id = '3e8e1300-d8fa-485d-856e-9e7d09ef24c0'
)
AND (metadata IS NULL OR metadata = '{}' OR metadata::text = '{}');

-- Glayza's DEPOSITO/SAQUE entries -> banco C6
UPDATE supplier_ledger SET metadata = jsonb_build_object('banco_id', '8b782c81-0e64-48d0-9d50-4aa347045605', 'banco_nome', 'C6')
WHERE tipo IN ('DEPOSITO', 'SAQUE')
AND bookmaker_account_id IN (
  SELECT id FROM supplier_bookmaker_accounts WHERE titular_id = '6d217665-dfa2-490a-9d74-00e2cfc3ec74'
)
AND (metadata IS NULL OR metadata = '{}' OR metadata::text = '{}');

-- TRANSFERENCIA_BANCO -> José Roberto's banco (description says MERCADO PAGO)
UPDATE supplier_ledger SET metadata = jsonb_build_object('banco_id', 'ee7f7385-34e8-4357-9bb0-cf830d324670', 'banco_nome', 'MERCADO PAGO', 'titular_id', '3e8e1300-d8fa-485d-856e-9e7d09ef24c0')
WHERE tipo = 'TRANSFERENCIA_BANCO'
AND (metadata IS NULL OR metadata = '{}' OR metadata::text = '{}');