
-- Fix corrupted saldo_freebet for PLAYIO bookmaker (was double-credited: 100 instead of 50)
-- Recalculate from financial_events source of truth
UPDATE bookmakers 
SET saldo_freebet = (
  SELECT COALESCE(SUM(valor), 0) 
  FROM financial_events 
  WHERE bookmaker_id = 'd5b68b0d-610d-44eb-88a9-8c405ba77b2b' 
  AND tipo_uso = 'FREEBET'
)
WHERE id = 'd5b68b0d-610d-44eb-88a9-8c405ba77b2b';
