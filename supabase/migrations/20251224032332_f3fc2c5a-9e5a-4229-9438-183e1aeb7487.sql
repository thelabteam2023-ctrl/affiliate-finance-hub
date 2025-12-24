
-- Fase 6: Limpeza de tabelas e views legadas
-- Remove views de compatibilidade (ordem importante: views primeiro, depois tabelas)

-- Drop compatibility views
DROP VIEW IF EXISTS public.v_apostas_compat CASCADE;
DROP VIEW IF EXISTS public.v_apostas_multiplas_compat CASCADE;
DROP VIEW IF EXISTS public.v_surebets_compat CASCADE;
DROP VIEW IF EXISTS public.v_projeto_apostas_resumo CASCADE;

-- Drop legacy tables (CASCADE para remover dependências)
DROP TABLE IF EXISTS public.surebets CASCADE;
DROP TABLE IF EXISTS public.apostas CASCADE;
DROP TABLE IF EXISTS public.apostas_multiplas CASCADE;
