
-- 1. Delete the freebet record
DELETE FROM freebets_recebidas WHERE id = '57d0fcc4-24e0-4b82-93a6-c1bfc99ff68d';

-- 2. Insert a reversal event to zero out the +6 adjustment that was incorrectly applied
INSERT INTO financial_events (
  bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda,
  descricao, event_scope, created_by,
  idempotency_key
)
SELECT
  '2af8aa5c-ae63-4245-95d6-44521be86c80',
  workspace_id,
  'AJUSTE',
  'FREEBET',
  'MANUAL',
  -10,
  moeda,
  'Correção manual: zerando saldo freebet Superbet inexistente',
  'REAL',
  created_by,
  'fix_superbet_freebet_zero_' || gen_random_uuid()
FROM financial_events
WHERE id = '12c36100-45fe-421d-b433-8c2d624790ff';

-- 3. Force saldo_freebet to zero (trigger should handle this, but ensure consistency)
UPDATE bookmakers SET saldo_freebet = 0 WHERE id = '2af8aa5c-ae63-4245-95d6-44521be86c80';
