-- Remove políticas conflitantes que permitem acesso indevido a bookmakers GLOBAL_RESTRICTED

-- 1. Remover a política defeituosa que permite ver GLOBAL_RESTRICTED sem verificar acesso
DROP POLICY IF EXISTS "bookmakers_catalogo_select_policy" ON public.bookmakers_catalogo;

-- 2. Remover política antiga duplicada
DROP POLICY IF EXISTS "Users can view system and own bookmakers catalog" ON public.bookmakers_catalogo;

-- A política correta "View bookmakers catalogo" já existe e será mantida:
-- Ela verifica corretamente:
-- - GLOBAL_REGULATED: todos veem
-- - GLOBAL_RESTRICTED: só quem tem acesso direto OU via grupo ativo
-- - WORKSPACE_PRIVATE: só o criador vê