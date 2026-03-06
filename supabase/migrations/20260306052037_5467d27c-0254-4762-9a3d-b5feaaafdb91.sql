
-- Fix orphaned deposits: for bookmakers that have saques attributed to a project,
-- also attribute their NULL-snapshot deposits to the same project.
-- This handles the case where deposits were made before the snapshot system existed.
UPDATE cash_ledger dep
SET projeto_id_snapshot = saq.projeto_id_snapshot
FROM (
  SELECT DISTINCT origem_bookmaker_id as bookmaker_id, projeto_id_snapshot
  FROM cash_ledger
  WHERE projeto_id_snapshot IS NOT NULL
  AND tipo_transacao IN ('SAQUE', 'SAQUE_VIRTUAL')
  AND status = 'CONFIRMADO'
) saq
WHERE dep.destino_bookmaker_id = saq.bookmaker_id
AND dep.tipo_transacao IN ('DEPOSITO', 'DEPOSITO_VIRTUAL')
AND dep.status = 'CONFIRMADO'
AND dep.projeto_id_snapshot IS NULL;
