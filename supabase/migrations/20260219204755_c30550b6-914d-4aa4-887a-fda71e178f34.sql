
-- Adiciona campo prazo (deadline) e suporte a múltiplos bookmakers
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS prazo TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS bookmaker_ids UUID[] NULL;

-- Índice para prazo para facilitar consultas de vencimento
CREATE INDEX IF NOT EXISTS idx_solicitacoes_prazo ON public.solicitacoes(prazo) WHERE prazo IS NOT NULL;
