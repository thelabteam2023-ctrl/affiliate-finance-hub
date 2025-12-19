-- Tornar CPF opcional na tabela operadores
-- O CPF pode não estar disponível no perfil do usuário ao vincular
ALTER TABLE public.operadores ALTER COLUMN cpf DROP NOT NULL;