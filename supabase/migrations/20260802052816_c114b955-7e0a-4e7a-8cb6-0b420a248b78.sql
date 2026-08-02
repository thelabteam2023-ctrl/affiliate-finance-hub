ALTER TABLE public.ocorrencias
  ADD COLUMN IF NOT EXISTS wallet_origem_id uuid REFERENCES public.wallets_crypto(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wallet_destino_id uuid REFERENCES public.wallets_crypto(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS endereco_destino_externo text,
  ADD COLUMN IF NOT EXISTS network text,
  ADD COLUMN IF NOT EXISTS coin text,
  ADD COLUMN IF NOT EXISTS quantidade_cripto numeric(30,10),
  ADD COLUMN IF NOT EXISTS tx_hash text,
  ADD COLUMN IF NOT EXISTS valor_recuperado numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desfecho text,
  ADD COLUMN IF NOT EXISTS perda_ledger_id uuid REFERENCES public.cash_ledger(id) ON DELETE SET NULL;

ALTER TABLE public.ocorrencias
  DROP CONSTRAINT IF EXISTS ocorrencias_desfecho_check;
ALTER TABLE public.ocorrencias
  ADD CONSTRAINT ocorrencias_desfecho_check
  CHECK (desfecho IS NULL OR desfecho IN ('recuperado_total','recuperado_parcial','perda_definitiva'));

CREATE INDEX IF NOT EXISTS idx_ocorrencias_wallet_origem ON public.ocorrencias(wallet_origem_id) WHERE wallet_origem_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ocorrencias_wallet_destino ON public.ocorrencias(wallet_destino_id) WHERE wallet_destino_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ocorrencias_perda_ledger ON public.ocorrencias(perda_ledger_id) WHERE perda_ledger_id IS NOT NULL;