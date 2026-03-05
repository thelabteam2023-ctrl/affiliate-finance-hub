
-- RESET COMPLETO - Parte 1: Limpar ledger e eventos
DELETE FROM cash_ledger 
WHERE projeto_id_snapshot = '65eb4629-9f15-4554-8a29-f9eb75dbe72a';

DELETE FROM financial_events 
WHERE bookmaker_id IN ('d4342e9a-c933-4661-a16d-ae7668d0d489', 'd5b68b0d-610d-44eb-88a9-8c405ba77b2b', '2225697b-ae67-4449-8c2b-58a2da8989c1');

DELETE FROM bookmaker_balance_audit 
WHERE bookmaker_id IN ('d4342e9a-c933-4661-a16d-ae7668d0d489', 'd5b68b0d-610d-44eb-88a9-8c405ba77b2b', '2225697b-ae67-4449-8c2b-58a2da8989c1');

DELETE FROM apostas_pernas 
WHERE aposta_id IN (SELECT id FROM apostas_unificada WHERE projeto_id = '65eb4629-9f15-4554-8a29-f9eb75dbe72a');

DELETE FROM apostas_unificada 
WHERE projeto_id = '65eb4629-9f15-4554-8a29-f9eb75dbe72a';

-- Parte 2: Resetar bookmakers
UPDATE bookmakers SET 
  saldo_atual = 250, saldo_bonus = 0, saldo_freebet = 0, saldo_irrecuperavel = 0, aguardando_saque_at = NULL
WHERE id = '2225697b-ae67-4449-8c2b-58a2da8989c1';

UPDATE bookmakers SET 
  saldo_atual = 100, saldo_bonus = 0, saldo_freebet = 0, saldo_irrecuperavel = 0, aguardando_saque_at = NULL
WHERE id = 'd5b68b0d-610d-44eb-88a9-8c405ba77b2b';

UPDATE bookmakers SET 
  saldo_atual = 500, saldo_bonus = 0, saldo_freebet = 0, saldo_irrecuperavel = 0, aguardando_saque_at = NULL
WHERE id = 'd4342e9a-c933-4661-a16d-ae7668d0d489';

-- Parte 3: Re-inserir depósitos correspondentes aos saldos
INSERT INTO cash_ledger (user_id, workspace_id, tipo_transacao, tipo_moeda, moeda, valor, status, destino_bookmaker_id, projeto_id_snapshot, data_transacao, impacta_caixa_operacional)
VALUES 
  ((SELECT user_id FROM bookmakers WHERE id = '2225697b-ae67-4449-8c2b-58a2da8989c1'), 
   (SELECT workspace_id FROM bookmakers WHERE id = '2225697b-ae67-4449-8c2b-58a2da8989c1'),
   'DEPOSITO', 'FIAT', 'BRL', 250, 'CONFIRMADO', '2225697b-ae67-4449-8c2b-58a2da8989c1', '65eb4629-9f15-4554-8a29-f9eb75dbe72a', now(), true),
   
  ((SELECT user_id FROM bookmakers WHERE id = 'd5b68b0d-610d-44eb-88a9-8c405ba77b2b'),
   (SELECT workspace_id FROM bookmakers WHERE id = 'd5b68b0d-610d-44eb-88a9-8c405ba77b2b'),
   'DEPOSITO', 'FIAT', 'USD', 100, 'CONFIRMADO', 'd5b68b0d-610d-44eb-88a9-8c405ba77b2b', '65eb4629-9f15-4554-8a29-f9eb75dbe72a', now(), true),
   
  ((SELECT user_id FROM bookmakers WHERE id = 'd4342e9a-c933-4661-a16d-ae7668d0d489'),
   (SELECT workspace_id FROM bookmakers WHERE id = 'd4342e9a-c933-4661-a16d-ae7668d0d489'),
   'DEPOSITO', 'FIAT', 'BRL', 500, 'CONFIRMADO', 'd4342e9a-c933-4661-a16d-ae7668d0d489', '65eb4629-9f15-4554-8a29-f9eb75dbe72a', now(), true);
