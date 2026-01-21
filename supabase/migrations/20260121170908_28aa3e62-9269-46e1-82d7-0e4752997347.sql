-- Adicionar colunas de cotação de trabalho para moedas sem PTAX no BCB
-- MYR (Ringgit Malaio), MXN (Peso Mexicano), ARS (Peso Argentino), COP (Peso Colombiano)

ALTER TABLE public.projetos 
ADD COLUMN IF NOT EXISTS cotacao_trabalho_myr numeric DEFAULT 1.20,
ADD COLUMN IF NOT EXISTS cotacao_trabalho_mxn numeric DEFAULT 0.26,
ADD COLUMN IF NOT EXISTS cotacao_trabalho_ars numeric DEFAULT 0.005,
ADD COLUMN IF NOT EXISTS cotacao_trabalho_cop numeric DEFAULT 0.0013;

-- Comentários para documentação
COMMENT ON COLUMN public.projetos.cotacao_trabalho_myr IS 'Cotação de trabalho MYR/BRL - Ringgit Malaio (sem PTAX no BCB)';
COMMENT ON COLUMN public.projetos.cotacao_trabalho_mxn IS 'Cotação de trabalho MXN/BRL - Peso Mexicano (sem PTAX no BCB)';
COMMENT ON COLUMN public.projetos.cotacao_trabalho_ars IS 'Cotação de trabalho ARS/BRL - Peso Argentino (sem PTAX no BCB)';
COMMENT ON COLUMN public.projetos.cotacao_trabalho_cop IS 'Cotação de trabalho COP/BRL - Peso Colombiano (sem PTAX no BCB)';