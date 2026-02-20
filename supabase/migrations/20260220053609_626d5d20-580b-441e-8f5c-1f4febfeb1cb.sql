
-- Adicionar campos de taxa ao cadastro de bancos
ALTER TABLE public.bancos
  ADD COLUMN IF NOT EXISTS taxa_percentual DECIMAL(6,4) NULL,
  ADD COLUMN IF NOT EXISTS taxa_incidencia TEXT NULL;

-- Constraint: taxa_incidencia só pode ser 'deposito', 'saque' ou NULL
ALTER TABLE public.bancos
  ADD CONSTRAINT bancos_taxa_incidencia_check
  CHECK (taxa_incidencia IS NULL OR taxa_incidencia IN ('deposito', 'saque'));
