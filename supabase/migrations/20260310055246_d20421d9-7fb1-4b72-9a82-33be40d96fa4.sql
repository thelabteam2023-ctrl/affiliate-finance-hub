ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS metrica_lucro_ciclo TEXT NOT NULL DEFAULT 'operacional';

COMMENT ON COLUMN public.projetos.metrica_lucro_ciclo IS 'Métrica usada para calcular lucro dos ciclos: operacional (apostas+extras-perdas) ou realizado (saques-depósitos)';