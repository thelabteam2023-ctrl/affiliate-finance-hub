ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS aguardando_de text NULL;

ALTER TYPE public.ocorrencia_evento_tipo ADD VALUE IF NOT EXISTS 'campo_alterado';