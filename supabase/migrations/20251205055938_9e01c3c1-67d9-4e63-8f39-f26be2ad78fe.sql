-- Add modelo_absorcao_taxas to projetos table
ALTER TABLE public.projetos 
ADD COLUMN modelo_absorcao_taxas TEXT NOT NULL DEFAULT 'EMPRESA_100';

-- Remove modelo_absorcao_taxas from operador_projetos table
ALTER TABLE public.operador_projetos 
DROP COLUMN modelo_absorcao_taxas;