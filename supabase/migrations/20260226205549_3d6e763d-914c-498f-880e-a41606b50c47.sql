-- Adicionar campo conta_bancaria_id na tabela ocorrencias
ALTER TABLE public.ocorrencias 
ADD COLUMN conta_bancaria_id UUID REFERENCES public.contas_bancarias(id) ON DELETE SET NULL;

-- Índice para performance
CREATE INDEX idx_ocorrencias_conta_bancaria_id ON public.ocorrencias(conta_bancaria_id) WHERE conta_bancaria_id IS NOT NULL;