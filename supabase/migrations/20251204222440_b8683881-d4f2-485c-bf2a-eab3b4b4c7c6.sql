
-- Remover a constraint antiga e adicionar uma nova que inclui AGUARDANDO_SAQUE
ALTER TABLE public.bookmakers DROP CONSTRAINT IF EXISTS bookmakers_status_check;

ALTER TABLE public.bookmakers ADD CONSTRAINT bookmakers_status_check 
CHECK (status IN ('ativo', 'inativo', 'limitada', 'ATIVO', 'INATIVO', 'LIMITADA', 'AGUARDANDO_SAQUE', 'aguardando_saque'));
