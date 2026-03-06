
-- Add 'aguardando_saque' to the allowed status values
ALTER TABLE public.bookmakers DROP CONSTRAINT bookmakers_status_check;

ALTER TABLE public.bookmakers ADD CONSTRAINT bookmakers_status_check 
  CHECK (status = ANY (ARRAY[
    'ativo'::text, 'ATIVO'::text, 
    'limitada'::text, 'LIMITADA'::text, 
    'encerrada'::text, 'ENCERRADA'::text, 
    'bloqueada'::text, 'BLOQUEADA'::text, 
    'EM_USO'::text, 'em_uso'::text,
    'aguardando_saque'::text, 'AGUARDANDO_SAQUE'::text
  ]));
