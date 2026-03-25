
-- Neutralizar o aporte errado de US$ 15.000,30 (moeda USD em conta BRL)
-- Usa SAQUE do Caixa para inverter o efeito do APORTE
INSERT INTO cash_ledger (
  user_id, workspace_id, tipo_transacao, tipo_moeda, valor, moeda, status,
  origem_tipo, destino_tipo, impacta_caixa_operacional,
  descricao, referencia_transacao_id, data_transacao,
  financial_events_generated, transit_status
)
SELECT 
  user_id, workspace_id, 'SAQUE', 'FIAT', 15000.3, 'USD', 'CONFIRMADO',
  'CAIXA_OPERACIONAL', 'INVESTIDOR', true,
  'ESTORNO: Aporte USD indevido - conta bancária só aceita BRL. Ref: 52853e41',
  '52853e41-db06-4f1b-8ace-5abfc11c0811',
  NOW(),
  true, 'CONFIRMED'
FROM cash_ledger
WHERE id = '52853e41-db06-4f1b-8ace-5abfc11c0811';
