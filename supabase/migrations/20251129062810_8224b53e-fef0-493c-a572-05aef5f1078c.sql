-- Make agencia and conta nullable in contas_bancarias table
ALTER TABLE public.contas_bancarias 
ALTER COLUMN agencia DROP NOT NULL;

ALTER TABLE public.contas_bancarias 
ALTER COLUMN conta DROP NOT NULL;