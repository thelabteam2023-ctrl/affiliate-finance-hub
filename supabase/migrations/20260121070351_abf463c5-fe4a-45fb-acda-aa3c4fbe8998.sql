-- Adicionar campos para cotação de trabalho de EUR e GBP
-- Permite que cada projeto tenha sua própria cotação de referência para cada moeda

ALTER TABLE public.projetos 
ADD COLUMN IF NOT EXISTS cotacao_trabalho_eur NUMERIC DEFAULT 6.10;

ALTER TABLE public.projetos 
ADD COLUMN IF NOT EXISTS cotacao_trabalho_gbp NUMERIC DEFAULT 7.10;

-- Comentários para documentação
COMMENT ON COLUMN public.projetos.cotacao_trabalho IS 'Cotação de trabalho USD/BRL definida pelo usuário';
COMMENT ON COLUMN public.projetos.cotacao_trabalho_eur IS 'Cotação de trabalho EUR/BRL definida pelo usuário';
COMMENT ON COLUMN public.projetos.cotacao_trabalho_gbp IS 'Cotação de trabalho GBP/BRL definida pelo usuário';