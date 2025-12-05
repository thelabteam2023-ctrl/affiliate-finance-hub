-- Add custo_aquisicao_isento field to parcerias table
ALTER TABLE public.parcerias 
ADD COLUMN custo_aquisicao_isento boolean DEFAULT false;