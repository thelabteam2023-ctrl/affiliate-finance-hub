-- Add status column to projeto_perdas table
ALTER TABLE public.projeto_perdas 
ADD COLUMN status text NOT NULL DEFAULT 'PENDENTE';

-- Add check constraint for valid status values
ALTER TABLE public.projeto_perdas 
ADD CONSTRAINT projeto_perdas_status_check 
CHECK (status IN ('PENDENTE', 'CONFIRMADA', 'REVERSA'));

-- Create index for faster queries by status
CREATE INDEX idx_projeto_perdas_status ON public.projeto_perdas(status);
CREATE INDEX idx_projeto_perdas_bookmaker_status ON public.projeto_perdas(bookmaker_id, status);

-- Add column to track when status was changed
ALTER TABLE public.projeto_perdas 
ADD COLUMN data_confirmacao timestamp with time zone,
ADD COLUMN data_reversao timestamp with time zone;

-- Comment on columns for documentation
COMMENT ON COLUMN public.projeto_perdas.status IS 'Status da perda: PENDENTE (capital bloqueado), CONFIRMADA (prejuízo efetivo), REVERSA (devolvida)';
COMMENT ON COLUMN public.projeto_perdas.data_confirmacao IS 'Data em que a perda foi confirmada';
COMMENT ON COLUMN public.projeto_perdas.data_reversao IS 'Data em que a perda foi revertida';