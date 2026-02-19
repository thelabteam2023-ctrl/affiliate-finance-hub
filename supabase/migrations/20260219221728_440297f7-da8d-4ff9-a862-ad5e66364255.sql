ALTER TABLE public.solicitacoes
ADD COLUMN IF NOT EXISTS descricao_editada_at TIMESTAMPTZ NULL;