
-- Atualizar enum ocorrencia_tipo com os novos valores
-- 1. Converter coluna para text temporariamente
ALTER TABLE public.ocorrencias ALTER COLUMN tipo TYPE text;

-- 2. Dropar o enum antigo
DROP TYPE IF EXISTS public.ocorrencia_tipo CASCADE;

-- 3. Criar novo enum
CREATE TYPE public.ocorrencia_tipo AS ENUM (
  'saques',
  'depositos',
  'financeiro',
  'kyc',
  'bloqueio_bancario',
  'bloqueio_contas'
);

-- 4. Atualizar dados existentes mapeando tipos antigos para novos
UPDATE public.ocorrencias SET tipo = 'saques' WHERE tipo = 'saque_atrasado';
UPDATE public.ocorrencias SET tipo = 'depositos' WHERE tipo = 'deposito_nao_creditado';
UPDATE public.ocorrencias SET tipo = 'kyc' WHERE tipo = 'compliance';
UPDATE public.ocorrencias SET tipo = 'saques' WHERE tipo = 'afiliado';
UPDATE public.ocorrencias SET tipo = 'financeiro' WHERE tipo = 'bug_sistema';
UPDATE public.ocorrencias SET tipo = 'financeiro' WHERE tipo = 'outros';

-- 5. Reconverter coluna para o novo enum
ALTER TABLE public.ocorrencias ALTER COLUMN tipo TYPE public.ocorrencia_tipo USING tipo::public.ocorrencia_tipo;

-- 6. Restaurar o default
ALTER TABLE public.ocorrencias ALTER COLUMN tipo SET DEFAULT 'financeiro'::public.ocorrencia_tipo;
