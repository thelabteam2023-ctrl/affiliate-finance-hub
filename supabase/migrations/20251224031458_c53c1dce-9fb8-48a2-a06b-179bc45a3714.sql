-- Drop matched betting view
DROP VIEW IF EXISTS public.v_matched_betting_resumo CASCADE;

-- Drop matched betting tables with CASCADE (handles foreign key dependencies)
DROP TABLE IF EXISTS public.matched_betting_pernas CASCADE;
DROP TABLE IF EXISTS public.matched_betting_rounds CASCADE;
DROP TABLE IF EXISTS public.matched_betting_promocoes CASCADE;

-- Delete any matched betting records from apostas_unificada
DELETE FROM public.apostas_unificada 
WHERE forma_registro = 'MATCHED_BETTING' OR estrategia = 'MATCHED_BETTING';