-- Add tipo_participacao and participacao_referencia_id columns to participacao_ciclos
ALTER TABLE public.participacao_ciclos 
ADD COLUMN tipo_participacao text NOT NULL DEFAULT 'REGULAR',
ADD COLUMN participacao_referencia_id uuid REFERENCES public.participacao_ciclos(id);

-- Add constraint for valid tipo_participacao values
ALTER TABLE public.participacao_ciclos 
ADD CONSTRAINT chk_tipo_participacao CHECK (tipo_participacao IN ('REGULAR', 'AJUSTE_POSITIVO', 'BONUS'));

-- Create index for referencia lookups
CREATE INDEX idx_participacao_referencia ON public.participacao_ciclos(participacao_referencia_id) WHERE participacao_referencia_id IS NOT NULL;