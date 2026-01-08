-- =====================================================
-- CORREÇÃO DE POLÍTICAS RLS COM PERMISSÕES INCORRETAS
-- =====================================================

-- 1. BOOKMAKERS: Corrigir política de INSERT
-- A permissão 'bookmakers.edit' não existe, deve usar 'bookmakers.accounts.create'
DROP POLICY IF EXISTS bookmakers_ws_insert ON public.bookmakers;

CREATE POLICY "bookmakers_ws_insert" ON public.bookmakers
FOR INSERT TO authenticated
WITH CHECK (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'bookmakers.accounts.create'::text, workspace_id)
);

-- 2. BOOKMAKERS: Corrigir política de UPDATE para usar permissão correta
DROP POLICY IF EXISTS bookmakers_ws_update ON public.bookmakers;

CREATE POLICY "bookmakers_ws_update" ON public.bookmakers
FOR UPDATE TO authenticated
USING (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'bookmakers.accounts.edit'::text, workspace_id)
);

-- 3. BOOKMAKERS: Corrigir política de DELETE para usar permissão correta  
DROP POLICY IF EXISTS bookmakers_ws_delete ON public.bookmakers;

CREATE POLICY "bookmakers_ws_delete" ON public.bookmakers
FOR DELETE TO authenticated
USING (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'bookmakers.accounts.delete'::text, workspace_id)
);

-- 4. PARCEIROS: Corrigir política de INSERT para usar parceiros.create
DROP POLICY IF EXISTS parceiros_ws_insert ON public.parceiros;

CREATE POLICY "parceiros_ws_insert" ON public.parceiros
FOR INSERT TO authenticated
WITH CHECK (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'parceiros.create'::text, workspace_id)
);

-- 5. PROJETOS: Corrigir política de INSERT para usar projetos.create
DROP POLICY IF EXISTS projetos_ws_insert ON public.projetos;

CREATE POLICY "projetos_ws_insert" ON public.projetos
FOR INSERT TO authenticated
WITH CHECK (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'projetos.create'::text, workspace_id)
);