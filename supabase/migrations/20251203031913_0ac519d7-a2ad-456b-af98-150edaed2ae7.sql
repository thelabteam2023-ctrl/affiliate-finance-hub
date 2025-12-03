-- Remove a constraint única incorreta (user_id, nome)
ALTER TABLE public.bookmakers DROP CONSTRAINT IF EXISTS bookmakers_user_id_nome_key;

-- Adiciona a constraint correta: um parceiro só pode ter um vínculo por bookmaker
ALTER TABLE public.bookmakers ADD CONSTRAINT bookmakers_user_parceiro_bookmaker_unique 
  UNIQUE (user_id, parceiro_id, bookmaker_catalogo_id);