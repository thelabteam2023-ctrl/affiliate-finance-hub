
-- Backfill: Set projeto_id_snapshot for deposits that are missing it
-- These deposits target bookmakers currently linked to the project
UPDATE cash_ledger
SET projeto_id_snapshot = b.projeto_id
FROM bookmakers b
WHERE cash_ledger.destino_bookmaker_id = b.id
  AND b.projeto_id IS NOT NULL
  AND cash_ledger.projeto_id_snapshot IS NULL
  AND cash_ledger.tipo_transacao IN ('DEPOSITO', 'DEPOSITO_VIRTUAL')
  AND cash_ledger.status = 'CONFIRMADO';
