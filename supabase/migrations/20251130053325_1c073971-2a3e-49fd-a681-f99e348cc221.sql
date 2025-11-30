-- Remover o constraint antigo que não permite 'limitada'
ALTER TABLE public.bookmakers DROP CONSTRAINT IF EXISTS bookmakers_status_check;

-- Adicionar novo constraint permitindo os status corretos
ALTER TABLE public.bookmakers
ADD CONSTRAINT bookmakers_status_check 
CHECK (status IN ('ativo', 'limitada'));