-- 1. Exclusão física do registro específico solicitado pelo usuário
-- Transação original: c1e04536-804f-4180-814e-8630cf9517c0 (Ismael $400.46 revertida)
-- Espelho de estorno: 6418578a-f458-4141-91ef-ea82db7cf4a2

DO $$
BEGIN
    -- Remover o espelho
    DELETE FROM public.cash_ledger WHERE id = '6418578a-f458-4141-91ef-ea82db7cf4a2';
    
    -- Remover o original
    DELETE FROM public.cash_ledger WHERE id = 'c1e04536-804f-4180-814e-8630cf9517c0';
END $$;