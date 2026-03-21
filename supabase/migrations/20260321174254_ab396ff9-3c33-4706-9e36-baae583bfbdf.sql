
-- Fix PGRST203 overload: Drop the old version without p_cotacao_usd and keep only the new one
-- The old version has 4 params, the new one has 5 (with p_cotacao_usd)
DROP FUNCTION IF EXISTS public.get_projeto_apostas_resumo(uuid, text, text, text);
