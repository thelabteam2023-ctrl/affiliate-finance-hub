
-- RECONCILIATION: Set saldo_atual = sum of events (source of truth) for all discrepant bookmakers
-- This corrects bookmakers where DV regeneration inflated saldos or where events don't match

-- Update saldo_atual to match the event-calculated value
UPDATE public.bookmakers b
SET saldo_atual = COALESCE(
    (SELECT SUM(fe.valor) 
     FROM public.financial_events fe 
     WHERE fe.bookmaker_id = b.id 
       AND (fe.tipo_uso IS NULL OR fe.tipo_uso != 'FREEBET')),
    0
),
    updated_at = NOW()
WHERE b.status IN ('ATIVO','ativo','LIMITADA','limitada')
  AND ABS(
    b.saldo_atual - COALESCE(
      (SELECT SUM(fe.valor) 
       FROM public.financial_events fe 
       WHERE fe.bookmaker_id = b.id 
         AND (fe.tipo_uso IS NULL OR fe.tipo_uso != 'FREEBET')),
      0
    )
  ) > 0.50;
