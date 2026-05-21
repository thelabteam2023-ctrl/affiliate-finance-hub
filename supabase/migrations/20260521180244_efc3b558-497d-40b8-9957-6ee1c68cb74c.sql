-- 1. Remover eventos financeiros indevidos de hoje (21/05/2026)
-- Casa: LEGIANO (47e1fe11-35a9-4417-a1ff-3687b74a218a)
-- Casa: STONEVEGAS (958f26cd-1033-473d-bcd6-43a960f0bd72)
DELETE FROM public.financial_events 
WHERE bookmaker_id IN ('47e1fe11-35a9-4417-a1ff-3687b74a218a', '958f26cd-1033-473d-bcd6-43a960f0bd72')
AND created_at >= '2026-05-21 00:00:00';

-- 2. Remover pernas de apostas de teste criadas hoje para essas casas
DELETE FROM public.apostas_pernas
WHERE bookmaker_id IN ('47e1fe11-35a9-4417-a1ff-3687b74a218a', '958f26cd-1033-473d-bcd6-43a960f0bd72')
AND created_at >= '2026-05-21 00:00:00';

-- 3. Resetar saldo das casas para zero
UPDATE public.bookmakers
SET saldo_atual = 0,
    updated_at = NOW()
WHERE id IN ('47e1fe11-35a9-4417-a1ff-3687b74a218a', '958f26cd-1033-473d-bcd6-43a960f0bd72');