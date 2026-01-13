-- Datas de despesas administrativas são datas civis (sem fuso)
-- Conversão segura: todos os registros existentes estão em 00:00:00 (validado previamente)
ALTER TABLE public.despesas_administrativas
  ALTER COLUMN data_despesa TYPE date
  USING (data_despesa::date);

-- Opcionalmente, garantir valor padrão coerente para novos registros (não quebra inserts existentes)
ALTER TABLE public.despesas_administrativas
  ALTER COLUMN data_despesa SET DEFAULT CURRENT_DATE;