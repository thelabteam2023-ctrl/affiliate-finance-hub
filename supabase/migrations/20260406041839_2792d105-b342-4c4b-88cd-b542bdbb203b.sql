
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS valor NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS lote_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_lote ON public.solicitacoes(lote_id) WHERE lote_id IS NOT NULL;
