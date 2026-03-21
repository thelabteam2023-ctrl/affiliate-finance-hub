-- Drop the 3-param version that conflicts with the 4-param version
DROP FUNCTION IF EXISTS public.get_projeto_apostas_resumo(uuid, text, text);
