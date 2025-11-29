-- Adicionar coluna is_system na tabela bookmakers_catalogo
ALTER TABLE public.bookmakers_catalogo 
ADD COLUMN is_system boolean DEFAULT false;

-- Atualizar os 5 bookmakers existentes para is_system = true
UPDATE public.bookmakers_catalogo
SET is_system = true
WHERE nome IN ('Sportingbet', 'Betano', 'BET365', 'KTO', 'BETBOO');

-- Remover políticas antigas
DROP POLICY IF EXISTS "Users can view own bookmakers catalog" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "Users can insert own bookmakers catalog" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "Users can update own bookmakers catalog" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "Users can delete own bookmakers catalog" ON public.bookmakers_catalogo;

-- Criar novas políticas RLS para permitir ver bookmakers do sistema + próprios
CREATE POLICY "Users can view system and own bookmakers catalog"
ON public.bookmakers_catalogo
FOR SELECT
USING (is_system = true OR auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmakers catalog"
ON public.bookmakers_catalogo
FOR INSERT
WITH CHECK (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can update own bookmakers catalog"
ON public.bookmakers_catalogo
FOR UPDATE
USING (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can delete own bookmakers catalog"
ON public.bookmakers_catalogo
FOR DELETE
USING (auth.uid() = user_id AND is_system = false);