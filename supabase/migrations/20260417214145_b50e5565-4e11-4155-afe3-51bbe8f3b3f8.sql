ALTER TABLE public.parceiros 
ADD COLUMN IF NOT EXISTS qualidade SMALLINT NULL CHECK (qualidade IS NULL OR (qualidade >= 1 AND qualidade <= 5));

COMMENT ON COLUMN public.parceiros.qualidade IS 'Avaliação manual de qualidade do parceiro (1 a 5 estrelas). NULL = sem avaliação.';