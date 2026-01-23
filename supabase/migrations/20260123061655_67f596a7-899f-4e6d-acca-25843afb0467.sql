-- Add tipo_projeto_snapshot to historico for tracking what project type the bookmaker was used in
ALTER TABLE public.projeto_bookmaker_historico 
ADD COLUMN tipo_projeto_snapshot TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.projeto_bookmaker_historico.tipo_projeto_snapshot IS 'Snapshot do tipo de projeto no momento da vinculação: SUREBET, DUPLO_GREEN, VALUEBET, PUNTER, BONUS, CASHBACK, OUTROS';