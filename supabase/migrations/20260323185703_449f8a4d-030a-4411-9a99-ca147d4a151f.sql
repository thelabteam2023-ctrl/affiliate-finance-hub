-- Drop the old 5-parameter overload that causes PGRST203 ambiguity
-- The 6-parameter version (with p_cotacoes DEFAULT NULL) covers all use cases
DROP FUNCTION IF EXISTS public.get_projeto_apostas_resumo(uuid, text, text, text, numeric);