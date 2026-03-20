-- Reconciliação: Aposta f263dff4 (SIMPLES multi-entry, R$17) foi liquidada como RED
-- mas NUNCA gerou eventos financeiros. O saldo do bookmaker MCGAMES (ed4bd799)
-- está R$17 acima do correto.
-- Criar eventos STAKE faltantes para cada perna (débito que nunca ocorreu)

-- Perna 1: stake R$13.60
INSERT INTO financial_events (
  bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
  valor, moeda, idempotency_key, descricao, processed_at
) VALUES (
  'ed4bd799-0355-459d-bfab-c3676926ce77',
  'f263dff4-c1af-4e4d-908c-3bd8569dd010',
  (SELECT workspace_id FROM apostas_unificada WHERE id = 'f263dff4-c1af-4e4d-908c-3bd8569dd010'),
  'STAKE', 'NORMAL',
  -13.60, 'BRL',
  'reconcil_stake_f263dff4_perna_8f17eeec',
  'Reconciliação: STAKE faltante perna multi-entry (R$13.60)',
  now()
) ON CONFLICT DO NOTHING;

-- Perna 2: stake R$3.40
INSERT INTO financial_events (
  bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
  valor, moeda, idempotency_key, descricao, processed_at
) VALUES (
  'ed4bd799-0355-459d-bfab-c3676926ce77',
  'f263dff4-c1af-4e4d-908c-3bd8569dd010',
  (SELECT workspace_id FROM apostas_unificada WHERE id = 'f263dff4-c1af-4e4d-908c-3bd8569dd010'),
  'STAKE', 'NORMAL',
  -3.40, 'BRL',
  'reconcil_stake_f263dff4_perna_611bae20',
  'Reconciliação: STAKE faltante perna multi-entry (R$3.40)',
  now()
) ON CONFLICT DO NOTHING;