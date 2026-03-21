
-- Inserir ajustes para BETANO Sebasthian e MAFIA Sebasthian (parceiros ativos)
INSERT INTO public.cash_ledger (tipo_transacao, valor, moeda, tipo_moeda, status, ajuste_direcao, ajuste_motivo, descricao, origem_bookmaker_id, user_id, workspace_id, data_transacao, impacta_caixa_operacional)
VALUES 
  ('AJUSTE_SALDO', 1500, 'BRL', 'FIAT', 'CONFIRMADO', 'SAIDA', 'Correção: conta encerrada sem saldo residual', 'Zeramento de saldo - conta sem operação ativa [auditoria 2026-03-21]', '5f599383-db75-49a9-b4f6-306aa1e323b1', '8e29dbc6-76fd-44ac-aad4-38105311dd42', 'feee9758-a7f4-474c-b2b1-679b66ec1cd9', CURRENT_DATE, false),
  ('AJUSTE_SALDO', 100.01, 'USD', 'FIAT', 'CONFIRMADO', 'SAIDA', 'Correção: conta encerrada sem saldo residual', 'Zeramento de saldo - conta sem operação ativa [auditoria 2026-03-21]', '896fef9f-cdf2-4302-a44b-af2afcf4db68', '27d899b5-8f91-46b7-a71d-a22deb48c31d', 'feee9758-a7f4-474c-b2b1-679b66ec1cd9', CURRENT_DATE, false);

-- MAFIA Juliana: inserir direto no financial_events (parceira inativa)
INSERT INTO public.financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
VALUES ('142684f8-74ab-4c25-a689-1c76d32fcd4a', 'feee9758-a7f4-474c-b2b1-679b66ec1cd9', 'AJUSTE', 'NORMAL', 'AJUSTE_SALDO', -101.20, 'USD', 'manual_zero_mafia_juliana_20260321', 'Zeramento de saldo - conta sem operação ativa [auditoria 2026-03-21]', '{"manual": true}'::jsonb, NOW(), '27d899b5-8f91-46b7-a71d-a22deb48c31d');

-- Recalcular saldo da MAFIA Juliana
UPDATE public.bookmakers
SET saldo_atual = (SELECT COALESCE(SUM(valor), 0) FROM public.financial_events WHERE bookmaker_id = '142684f8-74ab-4c25-a689-1c76d32fcd4a' AND tipo_uso = 'NORMAL'),
    updated_at = NOW()
WHERE id = '142684f8-74ab-4c25-a689-1c76d32fcd4a'
