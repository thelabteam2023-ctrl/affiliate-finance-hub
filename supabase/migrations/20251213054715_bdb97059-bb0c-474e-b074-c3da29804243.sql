-- Add loss absorption configuration to projeto_acordos
ALTER TABLE public.projeto_acordos 
ADD COLUMN IF NOT EXISTS absorcao_prejuizo TEXT NOT NULL DEFAULT 'PROPORCIONAL';

ALTER TABLE public.projeto_acordos 
ADD COLUMN IF NOT EXISTS limite_prejuizo_investidor NUMERIC DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.projeto_acordos.absorcao_prejuizo IS 'How losses are absorbed: PROPORCIONAL, INVESTIDOR_100, EMPRESA_100, LIMITE_INVESTIDOR';
COMMENT ON COLUMN public.projeto_acordos.limite_prejuizo_investidor IS 'Max percentage of loss investor absorbs when absorcao_prejuizo = LIMITE_INVESTIDOR';