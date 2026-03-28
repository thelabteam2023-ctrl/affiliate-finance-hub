
-- Fix duplicated balance for bookmaker e0959e0e-42e2-46ff-9a63-3842592176b7
-- Root cause: tr_ensure_deposito_virtual_on_insert created a DV that doubled the initial saldo_atual
-- The DV of 5000 was correctly created as a baseline record, but the financial_event
-- it generated added +5000 on top of the already-inserted saldo_atual=5000

-- Insert a corrective SAQUE event to offset the duplicate credit
INSERT INTO financial_events (
  bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, 
  valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
)
SELECT
  'e0959e0e-42e2-46ff-9a63-3842592176b7',
  workspace_id,
  'SAQUE',
  'NORMAL',
  'AJUSTE_RECONCILIACAO',
  5000.00,
  'BRL',
  'fix_double_balance_e0959e0e_20260328',
  'Correção: saldo duplicado por trigger INSERT + DEPOSITO_VIRTUAL',
  '{"fix": "double_balance_on_insert", "original_saldo": 5000, "inflated_saldo": 10000}'::jsonb,
  NOW(),
  user_id
FROM bookmakers
WHERE id = 'e0959e0e-42e2-46ff-9a63-3842592176b7';
