
-- =====================================================
-- CORREÇÃO COMPLETA DE POLÍTICAS RLS - FASE 2
-- Adiciona verificação de permissões em UPDATE/DELETE
-- =====================================================

-- 1. PARCEIROS: Adicionar verificação de permissão em UPDATE
DROP POLICY IF EXISTS parceiros_ws_update ON public.parceiros;

CREATE POLICY "parceiros_ws_update" ON public.parceiros
FOR UPDATE TO authenticated
USING (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'parceiros.edit'::text, workspace_id)
);

-- 2. PARCEIROS: Adicionar verificação de permissão em DELETE
DROP POLICY IF EXISTS parceiros_ws_delete ON public.parceiros;

CREATE POLICY "parceiros_ws_delete" ON public.parceiros
FOR DELETE TO authenticated
USING (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'parceiros.delete'::text, workspace_id)
);

-- 3. PROJETOS: Adicionar verificação de permissão em UPDATE
DROP POLICY IF EXISTS projetos_ws_update ON public.projetos;

CREATE POLICY "projetos_ws_update" ON public.projetos
FOR UPDATE TO authenticated
USING (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'projetos.edit'::text, workspace_id)
);

-- 4. PROJETOS: Adicionar verificação de permissão em DELETE
DROP POLICY IF EXISTS projetos_ws_delete ON public.projetos;

CREATE POLICY "projetos_ws_delete" ON public.projetos
FOR DELETE TO authenticated
USING (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'projetos.delete'::text, workspace_id)
);

-- 5. OPERADORES: Adicionar verificação de permissão em INSERT
DROP POLICY IF EXISTS operadores_ws_insert ON public.operadores;

CREATE POLICY "operadores_ws_insert" ON public.operadores
FOR INSERT TO authenticated
WITH CHECK (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'operadores.create'::text, workspace_id)
);

-- 6. OPERADORES: Adicionar verificação de permissão em UPDATE
DROP POLICY IF EXISTS operadores_ws_update ON public.operadores;

CREATE POLICY "operadores_ws_update" ON public.operadores
FOR UPDATE TO authenticated
USING (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'operadores.edit'::text, workspace_id)
);

-- 7. OPERADORES: Adicionar verificação de permissão em DELETE (archive)
DROP POLICY IF EXISTS operadores_ws_delete ON public.operadores;

CREATE POLICY "operadores_ws_delete" ON public.operadores
FOR DELETE TO authenticated
USING (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'operadores.archive'::text, workspace_id)
);

-- 8. INVESTIDORES: Adicionar verificação de permissão em INSERT
DROP POLICY IF EXISTS investidores_ws_insert ON public.investidores;

CREATE POLICY "investidores_ws_insert" ON public.investidores
FOR INSERT TO authenticated
WITH CHECK (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'investidores.create'::text, workspace_id)
);

-- 9. INVESTIDORES: Adicionar verificação de permissão em UPDATE  
DROP POLICY IF EXISTS investidores_ws_update ON public.investidores;

CREATE POLICY "investidores_ws_update" ON public.investidores
FOR UPDATE TO authenticated
USING (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'investidores.edit'::text, workspace_id)
);

-- 10. INVESTIDORES: Adicionar verificação de permissão em DELETE
DROP POLICY IF EXISTS investidores_ws_delete ON public.investidores;

CREATE POLICY "investidores_ws_delete" ON public.investidores
FOR DELETE TO authenticated
USING (
  workspace_id = get_current_workspace() 
  AND has_permission(auth.uid(), 'investidores.delete'::text, workspace_id)
);
