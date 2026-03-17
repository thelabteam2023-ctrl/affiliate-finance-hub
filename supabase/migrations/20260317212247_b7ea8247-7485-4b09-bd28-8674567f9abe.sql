
-- Correção financeira: restaurar saldos após exclusão manual sem reversal
-- Aposta deletada: 657728f6-7e65-4884-860d-404c20998fa8 (PSGXCHELSEA - Duplo Green)

-- 1. AJUSTE +R$100 na BETANO
INSERT INTO financial_events (
  id, bookmaker_id, workspace_id, tipo_evento, valor, moeda,
  idempotency_key, descricao, metadata, created_by
) VALUES (
  gen_random_uuid(),
  '50d67e72-7b77-49f1-90e5-7d6a81985029',
  'feee9758-a7f4-474c-b2b1-679b66ec1cd9',
  'AJUSTE',
  100.00,
  'BRL',
  'reversal_manual_betano_657728f6_deleted_bet',
  'Estorno manual: aposta 657728f6 (PSGXCHELSEA) deletada sem reversal financeiro. Stake R$100 devolvida.',
  '{"motivo": "exclusao_manual_sem_reversal", "aposta_id_original": "657728f6-7e65-4884-860d-404c20998fa8", "evento": "PSGXCHELSEA", "estrategia": "DUPLO_GREEN", "correcao_por": "sistema"}'::jsonb,
  '8e29dbc6-76fd-44ac-aad4-38105311dd42'
);

-- 2. AJUSTE +R$92 na SUPERBET
INSERT INTO financial_events (
  id, bookmaker_id, workspace_id, tipo_evento, valor, moeda,
  idempotency_key, descricao, metadata, created_by
) VALUES (
  gen_random_uuid(),
  '2af8aa5c-ae63-4245-95d6-44521be86c80',
  'feee9758-a7f4-474c-b2b1-679b66ec1cd9',
  'AJUSTE',
  92.00,
  'BRL',
  'reversal_manual_superbet_657728f6_deleted_bet',
  'Estorno manual: aposta 657728f6 (PSGXCHELSEA) deletada sem reversal financeiro. Stake R$92 devolvida.',
  '{"motivo": "exclusao_manual_sem_reversal", "aposta_id_original": "657728f6-7e65-4884-860d-404c20998fa8", "evento": "PSGXCHELSEA", "estrategia": "DUPLO_GREEN", "correcao_por": "sistema"}'::jsonb,
  '8e29dbc6-76fd-44ac-aad4-38105311dd42'
);
