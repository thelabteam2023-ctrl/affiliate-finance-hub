-- Remover políticas existentes conflitantes
DROP POLICY IF EXISTS "bookmakers_catalogo_delete_policy" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "bookmakers_catalogo_update_policy" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "bookmakers_catalogo_insert_policy" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "bookmakers_catalogo_select_policy" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "Master can create bookmakers" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "Master can delete non-system bookmakers" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "Master can update any bookmaker" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "Users can create private bookmakers" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "Users can delete own private bookmakers" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "Users can update own private bookmakers" ON public.bookmakers_catalogo;
DROP POLICY IF EXISTS "View system bookmakers" ON public.bookmakers_catalogo;

-- SELECT: Todos podem ver bookmakers do sistema e globais; usuários veem suas privadas
CREATE POLICY "bookmakers_catalogo_select_policy" ON public.bookmakers_catalogo
FOR SELECT USING (
  -- System Owner vê tudo
  is_system_owner(auth.uid())
  OR
  -- Bookmakers do sistema (is_system = true) são visíveis a todos
  is_system = true
  OR
  -- Bookmakers globais são visíveis a todos
  visibility IN ('GLOBAL_REGULATED', 'GLOBAL_RESTRICTED')
  OR
  -- Usuário pode ver suas próprias bookmakers privadas
  (user_id = auth.uid() AND visibility = 'WORKSPACE_PRIVATE')
);

-- INSERT: System Owner pode criar qualquer; Master pode criar globais; Usuário pode criar privadas
CREATE POLICY "bookmakers_catalogo_insert_policy" ON public.bookmakers_catalogo
FOR INSERT WITH CHECK (
  -- System Owner pode criar qualquer bookmaker
  is_system_owner(auth.uid())
  OR
  -- Master pode criar bookmakers globais (is_system = false)
  (is_master(auth.uid()) AND is_system = false)
  OR
  -- Usuário pode criar apenas bookmakers privadas do seu workspace
  (auth.uid() = user_id AND visibility = 'WORKSPACE_PRIVATE' AND is_system = false)
);

-- UPDATE: System Owner pode editar qualquer; Master pode editar não-sistema; Usuário pode editar suas privadas
CREATE POLICY "bookmakers_catalogo_update_policy" ON public.bookmakers_catalogo
FOR UPDATE USING (
  -- System Owner pode editar QUALQUER bookmaker (inclusive is_system = true)
  is_system_owner(auth.uid())
  OR
  -- Master pode editar bookmakers não-sistema
  (is_master(auth.uid()) AND is_system = false)
  OR
  -- Usuário pode editar suas próprias bookmakers privadas
  (user_id = auth.uid() AND visibility = 'WORKSPACE_PRIVATE' AND is_system = false)
);

-- DELETE: System Owner pode deletar qualquer; Master pode deletar não-sistema; Usuário pode deletar suas privadas
CREATE POLICY "bookmakers_catalogo_delete_policy" ON public.bookmakers_catalogo
FOR DELETE USING (
  -- System Owner pode deletar QUALQUER bookmaker (inclusive is_system = true)
  is_system_owner(auth.uid())
  OR
  -- Master pode deletar bookmakers não-sistema
  (is_master(auth.uid()) AND is_system = false)
  OR
  -- Usuário pode deletar suas próprias bookmakers privadas
  (user_id = auth.uid() AND visibility = 'WORKSPACE_PRIVATE' AND is_system = false)
);