-- Remove absorcao_prejuizo column (no longer needed with slider approach)
ALTER TABLE public.projeto_acordos DROP COLUMN IF EXISTS absorcao_prejuizo;

-- Rename limite_prejuizo_investidor to percentual_prejuizo_investidor
ALTER TABLE public.projeto_acordos RENAME COLUMN limite_prejuizo_investidor TO percentual_prejuizo_investidor;

-- Update default to match profit percentage (40% default)
ALTER TABLE public.projeto_acordos ALTER COLUMN percentual_prejuizo_investidor SET DEFAULT 40;

-- Add comment for clarity
COMMENT ON COLUMN public.projeto_acordos.percentual_prejuizo_investidor IS 'Percentual do prejuízo absorvido pelo investidor (0-100). Por padrão igual ao percentual de lucro.';