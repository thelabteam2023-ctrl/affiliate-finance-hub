
-- 1. Novos campos analíticos em apostas_unificada (não destrutivo)
ALTER TABLE public.apostas_unificada
  ADD COLUMN IF NOT EXISTS liga                TEXT,
  ADD COLUMN IF NOT EXISTS mercado_categoria   TEXT,
  ADD COLUMN IF NOT EXISTS mercado_objeto      TEXT,
  ADD COLUMN IF NOT EXISTS mercado_formato     TEXT,
  ADD COLUMN IF NOT EXISTS mercado_direcao     TEXT,
  ADD COLUMN IF NOT EXISTS mercado_linha       NUMERIC(8,3),
  ADD COLUMN IF NOT EXISTS mercado_display     TEXT,
  ADD COLUMN IF NOT EXISTS fair_value          NUMERIC(10,5),
  ADD COLUMN IF NOT EXISTS edge_percentual     NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS odd_fechamento      NUMERIC(10,5),
  ADD COLUMN IF NOT EXISTS clv_percentual      NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS modelo_aposta       TEXT DEFAULT 'pre-jogo',
  ADD COLUMN IF NOT EXISTS is_novo_formulario  BOOLEAN NOT NULL DEFAULT false;

-- 2. Biblioteca pública de mercados (catálogo global)
CREATE TABLE IF NOT EXISTS public.mercados_biblioteca (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esporte           TEXT NOT NULL,
  categoria         TEXT NOT NULL,
  objeto            TEXT,
  formato_opcoes    TEXT[],
  direcao_opcoes    TEXT[] NOT NULL,
  tem_linha         BOOLEAN NOT NULL DEFAULT false,
  linha_placeholder TEXT,
  display_nome      TEXT NOT NULL,
  prioridade        INTEGER NOT NULL DEFAULT 0,
  ativo             BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mercados_biblioteca_esporte
  ON public.mercados_biblioteca(esporte, ativo, prioridade DESC);

GRANT SELECT ON public.mercados_biblioteca TO anon, authenticated;
GRANT ALL    ON public.mercados_biblioteca TO service_role;

ALTER TABLE public.mercados_biblioteca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mercados_biblioteca_public_read" ON public.mercados_biblioteca;
CREATE POLICY "mercados_biblioteca_public_read"
  ON public.mercados_biblioteca
  FOR SELECT
  USING (ativo = true);
