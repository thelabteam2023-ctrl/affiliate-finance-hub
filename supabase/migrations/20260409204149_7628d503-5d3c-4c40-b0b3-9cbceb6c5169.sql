
-- ============================================================
-- REVERSÃO: Remover eventos inseridos pela migração de bônus
-- Timestamp exato: 2026-04-09 19:02:17.719644+00
-- Total: 10 eventos, 8 bookmakers afetados
-- ============================================================

-- Step 1: Delete the 10 events from the bonus fix migration
DELETE FROM financial_events
WHERE created_at = '2026-04-09 19:02:17.719644+00';

-- Step 2: Recalculate balances for all 8 affected bookmakers
-- Using the trigger-safe approach: set balance = sum of remaining events

UPDATE bookmakers b
SET 
  saldo_atual = COALESCE(fe_normal.total, 0),
  saldo_freebet = COALESCE(fe_freebet.total, 0),
  updated_at = now()
FROM (
  SELECT bookmaker_id, 
    SUM(valor) FILTER (WHERE tipo_uso = 'NORMAL') as total_normal,
    SUM(valor) FILTER (WHERE tipo_uso = 'FREEBET') as total_freebet
  FROM financial_events
  GROUP BY bookmaker_id
) fe_calc
LEFT JOIN LATERAL (SELECT COALESCE(fe_calc.total_normal, 0) as total) fe_normal ON true
LEFT JOIN LATERAL (SELECT COALESCE(fe_calc.total_freebet, 0) as total) fe_freebet ON true
WHERE b.id = fe_calc.bookmaker_id
AND b.id IN (
  '53b2e61c-8c90-4033-83b6-9eafa85c6db9', -- BET365 (USER 002)
  'ed85db46-fc71-4eb5-a2c2-5015f1affc44', -- ESTRELABET (ALEF)
  '41b81646-b06c-46c8-b837-19790ee866ab', -- BORA JOGAR (ALEF)
  '4c4a31ed-650b-42c1-8818-5c87ac1f4799', -- XBET (LUIZ FELIPE)
  '586faa33-ba94-4d51-bcd4-9b7f8dae59db', -- PLAYIO (ARIANE)
  '279a63d5-44b9-48fa-bd2f-3dae80aaa691', -- APOSTAGANHA (ERICKSON)
  '7bf188df-2d53-4bfa-975b-e7b642f84640', -- GLORION (SEBASTHIAN)
  '9189524c-9479-4a5e-9775-2ce6ad9b7b0f'  -- HUGEWIN (ARIANE)
);
