
-- Fix bad reconciliation entries created before code fix
-- Entry 657c had both origem_tipo AND destino_tipo as CAIXA_OPERACIONAL (double-count bug)
-- Entry a804 was a follow-up 0.30 correction that's also wrong

-- Delete the two bad entries
DELETE FROM cash_ledger WHERE id = '657c3195-350c-4e13-8a3a-86ffff5ff264';
DELETE FROM cash_ledger WHERE id = 'a80466e2-7272-4c9a-8e40-de2906cad12f';

-- Insert correct reconciliation: balance 1451.47 → 11451.30, delta = +9999.83
INSERT INTO cash_ledger (
  user_id, workspace_id, tipo_transacao, tipo_moeda, moeda, valor,
  descricao, status, transit_status, data_transacao,
  impacta_caixa_operacional, ajuste_motivo, ajuste_direcao,
  origem_tipo, destino_tipo
) VALUES (
  (SELECT user_id FROM cash_ledger WHERE id = 'c699bf82-8449-4e97-ad3c-d59e12f48be6'),
  (SELECT workspace_id FROM cash_ledger WHERE id = 'c699bf82-8449-4e97-ad3c-d59e12f48be6'),
  'AJUSTE_RECONCILIACAO', 'FIAT', 'BRL', 9999.83,
  '[RECONCILIAÇÃO ENTRADA] Correção de saldo FIAT agregado | Saldo sistema: 1451.47 → Saldo real: 11451.30 | Diferença: +9999.83',
  'CONFIRMADO', 'CONFIRMED', '2026-03-07',
  true, 'Correção reconciliação FIAT', 'ENTRADA',
  'AJUSTE', 'CAIXA_OPERACIONAL'
);
