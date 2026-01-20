
-- =====================================================
-- AUDITORIA E CORREÇÃO DE RLS - TABELA CASH_LEDGER
-- =====================================================
-- Problema: Políticas de RLS muito restritivas causando
-- bloqueio de operações legítimas de administradores.
--
-- Causa Raiz: A função get_current_workspace() retorna
-- profiles.default_workspace_id, mas componentes no frontend
-- podem enviar um workspace_id diferente.
--
-- Solução: Política mais robusta que verifica se o usuário
-- é membro ativo do workspace sendo usado na transação.
-- =====================================================

-- 1. Criar função helper SECURITY DEFINER para verificar membership
CREATE OR REPLACE FUNCTION public.is_active_workspace_member(
  _user_id uuid,
  _workspace_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM workspace_members 
    WHERE user_id = _user_id 
      AND workspace_id = _workspace_id 
      AND is_active = true
  )
$$;

-- 2. Criar função para verificar se é owner/admin do workspace
CREATE OR REPLACE FUNCTION public.is_workspace_owner_or_admin(
  _user_id uuid,
  _workspace_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM workspace_members 
    WHERE user_id = _user_id 
      AND workspace_id = _workspace_id 
      AND is_active = true
      AND role IN ('owner', 'admin')
  )
$$;

-- 3. Drop políticas antigas do cash_ledger
DROP POLICY IF EXISTS "cash_ledger_ws_insert" ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_ws_select" ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_ws_update" ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_ws_delete" ON public.cash_ledger;

-- 4. Recriar políticas mais robustas

-- SELECT: Usuário pode ver transações do workspace onde é membro ativo
CREATE POLICY "cash_ledger_select_policy" ON public.cash_ledger
FOR SELECT
TO public
USING (
  -- Membro ativo do workspace
  is_active_workspace_member(auth.uid(), workspace_id)
);

-- INSERT: Usuário pode inserir se for membro ativo do workspace
-- E o user_id deve ser o próprio (para auditoria)
CREATE POLICY "cash_ledger_insert_policy" ON public.cash_ledger
FOR INSERT
TO public
WITH CHECK (
  -- Usuário autenticado
  auth.uid() IS NOT NULL
  -- user_id deve ser o próprio usuário (para rastreabilidade)
  AND user_id = auth.uid()
  -- Deve ser membro ativo do workspace especificado
  AND is_active_workspace_member(auth.uid(), workspace_id)
);

-- UPDATE: Apenas owner/admin do workspace pode atualizar
CREATE POLICY "cash_ledger_update_policy" ON public.cash_ledger
FOR UPDATE
TO public
USING (
  is_workspace_owner_or_admin(auth.uid(), workspace_id)
);

-- DELETE: Apenas owner do workspace pode deletar (mais restritivo)
CREATE POLICY "cash_ledger_delete_policy" ON public.cash_ledger
FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 
    FROM workspace_members 
    WHERE user_id = auth.uid() 
      AND workspace_id = cash_ledger.workspace_id 
      AND is_active = true
      AND role = 'owner'
  )
);

-- 5. Adicionar índice para performance das queries de membership
CREATE INDEX IF NOT EXISTS idx_workspace_members_active_lookup 
ON public.workspace_members(user_id, workspace_id, is_active, role);

-- 6. Comentários para documentação
COMMENT ON FUNCTION public.is_active_workspace_member IS 
'Verifica se um usuário é membro ativo de um workspace específico. Usada em políticas RLS.';

COMMENT ON FUNCTION public.is_workspace_owner_or_admin IS 
'Verifica se um usuário é owner ou admin de um workspace específico. Usada em políticas RLS.';

COMMENT ON POLICY "cash_ledger_insert_policy" ON public.cash_ledger IS 
'Permite INSERT se: (1) usuário autenticado, (2) user_id = auth.uid(), (3) membro ativo do workspace.';
