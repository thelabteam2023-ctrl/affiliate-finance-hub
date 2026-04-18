-- Remove a versão antiga da função para resolver ambiguidade do PostgREST
DROP FUNCTION IF EXISTS public.get_projetos_lucro_operacional(uuid[], date, date, jsonb);
DROP FUNCTION IF EXISTS public.get_projetos_lucro_operacional(uuid[], date, date);