-- Add foreign key relationships to apostas_multiplas table
-- These are needed for Supabase to recognize the relationships in queries

-- Add foreign key to bookmakers
ALTER TABLE public.apostas_multiplas
ADD CONSTRAINT apostas_multiplas_bookmaker_id_fkey
FOREIGN KEY (bookmaker_id) REFERENCES public.bookmakers(id) ON DELETE CASCADE;

-- Add foreign key to projetos
ALTER TABLE public.apostas_multiplas
ADD CONSTRAINT apostas_multiplas_projeto_id_fkey
FOREIGN KEY (projeto_id) REFERENCES public.projetos(id) ON DELETE CASCADE;

-- Add foreign key to auth.users (for user_id)
ALTER TABLE public.apostas_multiplas
ADD CONSTRAINT apostas_multiplas_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;