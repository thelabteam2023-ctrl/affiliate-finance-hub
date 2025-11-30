-- 1. Criar enum para roles se não existir
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('master', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Criar tabela user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 3. Habilitar RLS na tabela user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Política para user_roles (usuários podem ver apenas seus próprios roles)
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- 5. Criar função security definer para verificar se usuário é master
CREATE OR REPLACE FUNCTION public.is_master(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'master'
  )
$$;

-- 6. Atualizar política de SELECT da tabela bookmakers_catalogo
DROP POLICY IF EXISTS "Users can view system and own bookmakers catalog" ON public.bookmakers_catalogo;
CREATE POLICY "Users can view system and own bookmakers catalog"
  ON public.bookmakers_catalogo
  FOR SELECT
  USING (
    -- Master vê tudo
    public.is_master(auth.uid())
    OR
    -- Usuários comuns veem suas próprias casas
    (auth.uid() = user_id AND is_system = false)
    OR
    -- Usuários comuns veem casas do sistema APENAS se REGULAMENTADAS
    (is_system = true AND status = 'REGULAMENTADA')
  );