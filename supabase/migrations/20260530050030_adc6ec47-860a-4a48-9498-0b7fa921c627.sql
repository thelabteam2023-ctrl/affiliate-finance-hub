ALTER TABLE public.apostas_unificada
  ADD COLUMN IF NOT EXISTS tipo_mercado VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sub_tipo_mercado VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fair_odd NUMERIC(10,3);

COMMENT ON COLUMN public.apostas_unificada.tipo_mercado IS 'Geração 2: tipo canônico do mercado (handicap | resultado | total | outro). NULL para apostas históricas (Geração 1).';
COMMENT ON COLUMN public.apostas_unificada.sub_tipo_mercado IS 'Geração 2: sub-tipo específico (ex: "Total · Escanteios 1ºT"). NULL para apostas históricas.';
COMMENT ON COLUMN public.apostas_unificada.fair_odd IS 'Odd justa sem margem da casa. NULL = não disponível. Apostas com fair_odd participam da análise de Edge no Laboratório.';