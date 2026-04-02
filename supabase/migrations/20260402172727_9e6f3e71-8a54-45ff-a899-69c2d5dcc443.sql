
-- ============================================================
-- RESTAURAÇÃO DE SALDO: Contas broker Tiago Passos (BET365)
-- Causa: Reversão indevida de DEPOSITO_VIRTUAL baseline
-- ============================================================

-- 1) Restaurar otafernandes (efee7b4b): adicionar de volta o baseline revertido
INSERT INTO cash_ledger (
  tipo_transacao, valor, moeda, status, data_transacao,
  destino_bookmaker_id, destino_tipo,
  descricao, impacta_caixa_operacional, tipo_moeda,
  user_id, workspace_id
) VALUES (
  'AJUSTE_SALDO', 12630.68, 'BRL', 'CONFIRMADO', NOW(),
  'efee7b4b-088f-4116-a0c1-759c900e4af2', 'BOOKMAKER',
  'Restauração pós-refatoração broker: reversão indevida de baseline DEPOSITO_VIRTUAL (original: da09237f). Saldo anterior: -100.10, saldo esperado: 12530.58',
  false, 'FIAT',
  '4a0e13c3-319b-4b8e-b734-73f32890e77f', 'feee9758-a7f4-474c-b2b1-679b66ec1cd9'
);

-- 2) Restaurar AnajpyF (e0959e0e): adicionar de volta o baseline revertido
INSERT INTO cash_ledger (
  tipo_transacao, valor, moeda, status, data_transacao,
  destino_bookmaker_id, destino_tipo,
  descricao, impacta_caixa_operacional, tipo_moeda,
  user_id, workspace_id
) VALUES (
  'AJUSTE_SALDO', 5000.00, 'BRL', 'CONFIRMADO', NOW(),
  'e0959e0e-42e2-46ff-9a63-3842592176b7', 'BOOKMAKER',
  'Restauração pós-refatoração broker: reversão indevida de baseline DEPOSITO_VIRTUAL (original: e267c82c). Saldo anterior: -1150.72, saldo esperado: 3849.28',
  false, 'FIAT',
  '27d899b5-8f91-46b7-a71d-a22deb48c31d', 'feee9758-a7f4-474c-b2b1-679b66ec1cd9'
);
