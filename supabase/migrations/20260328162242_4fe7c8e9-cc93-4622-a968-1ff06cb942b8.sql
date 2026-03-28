
-- Fix: Insert corrective event with NEGATIVE value (convention: SAQUE must be negative)
-- Need to offset the previous wrong +5000 SAQUE (that added instead of subtracting)
-- AND the original +5000 DEPOSITO that was duplicated
-- Current saldo: 15000, target: 5000, so we need delta = -10000
INSERT INTO financial_events (
  bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, 
  valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
)
SELECT
  'e0959e0e-42e2-46ff-9a63-3842592176b7',
  workspace_id,
  'AJUSTE',
  'NORMAL',
  'RECONCILIACAO_MANUAL',
  -10000.00,
  'BRL',
  'fix_double_balance_v2_e0959e0e_20260328',
  'Correção: reverter saldo duplicado (15000 → 5000) causado por trigger INSERT + DV + fix anterior',
  '{"fix": "double_balance_on_insert_v2", "saldo_antes": 15000, "saldo_alvo": 5000}'::jsonb,
  NOW(),
  user_id
FROM bookmakers
WHERE id = 'e0959e0e-42e2-46ff-9a63-3842592176b7';
