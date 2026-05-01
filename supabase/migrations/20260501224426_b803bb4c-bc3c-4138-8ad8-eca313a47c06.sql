-- Remove the 'recorrente' column from 'despesas_administrativas' table
ALTER TABLE public.despesas_administrativas DROP COLUMN IF EXISTS recorrente;