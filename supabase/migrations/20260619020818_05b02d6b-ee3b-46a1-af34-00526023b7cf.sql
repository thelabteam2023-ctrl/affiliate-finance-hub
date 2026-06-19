ALTER TABLE public.apostas_pernas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'back',
  ADD COLUMN IF NOT EXISTS comissao numeric(7,5) NOT NULL DEFAULT 0;

ALTER TABLE public.apostas_pernas
  DROP CONSTRAINT IF EXISTS apostas_pernas_tipo_check,
  ADD CONSTRAINT apostas_pernas_tipo_check CHECK (tipo IN ('back','lay'));

ALTER TABLE public.apostas_pernas
  DROP CONSTRAINT IF EXISTS apostas_pernas_comissao_check,
  ADD CONSTRAINT apostas_pernas_comissao_check CHECK (comissao >= 0 AND comissao <= 1);

ALTER TABLE public.apostas_perna_entradas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'back',
  ADD COLUMN IF NOT EXISTS comissao numeric(7,5) NOT NULL DEFAULT 0;

ALTER TABLE public.apostas_perna_entradas
  DROP CONSTRAINT IF EXISTS apostas_perna_entradas_tipo_check,
  ADD CONSTRAINT apostas_perna_entradas_tipo_check CHECK (tipo IN ('back','lay'));

ALTER TABLE public.apostas_perna_entradas
  DROP CONSTRAINT IF EXISTS apostas_perna_entradas_comissao_check,
  ADD CONSTRAINT apostas_perna_entradas_comissao_check CHECK (comissao >= 0 AND comissao <= 1);