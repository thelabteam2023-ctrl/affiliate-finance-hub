-- ============================================
-- CORREÇÃO RLS: Adicionar política de INSERT para parceiros
-- e garantir padrão consistente em tabelas relacionadas
-- ============================================

-- 1. PARCEIROS - Adicionar política de INSERT
-- Permite insert se:
--   - workspace_id = workspace atual do usuário
--   - usuário tem permissão 'parceiros.edit' (inclui owner e admin por padrão)
CREATE POLICY "parceiros_ws_insert"
ON public.parceiros
FOR INSERT
TO authenticated
WITH CHECK (
  workspace_id = get_current_workspace()
  AND has_permission(auth.uid(), 'parceiros.edit', workspace_id)
);

-- 2. BOOKMAKERS - Verificar e adicionar política de INSERT se não existir
-- Primeiro dropar qualquer política antiga que use user_id incorretamente
DROP POLICY IF EXISTS "Users can insert own bookmakers" ON public.bookmakers;
DROP POLICY IF EXISTS "Workspace isolation bookmakers INSERT" ON public.bookmakers;

-- Criar política correta para INSERT
CREATE POLICY "bookmakers_ws_insert"
ON public.bookmakers
FOR INSERT
TO authenticated
WITH CHECK (
  workspace_id = get_current_workspace()
  AND has_permission(auth.uid(), 'bookmakers.edit', workspace_id)
);

-- 3. BANCOS - Corrigir política de INSERT (atualmente exige user_id = auth.uid())
-- Para bancos personalizados (is_system = false), permitir por workspace
DROP POLICY IF EXISTS "Users can insert own banks" ON public.bancos;

CREATE POLICY "bancos_ws_insert"
ON public.bancos
FOR INSERT
TO authenticated
WITH CHECK (
  (is_system = false)
  AND (user_id = auth.uid())
);

-- Nota: bancos mantém user_id pois são pessoais do usuário, não do workspace
-- Se quiser bancos por workspace, seria necessário adicionar workspace_id à tabela

-- 4. Garantir que contas_bancarias e wallets_crypto estão corretos (já usam has_permission)
-- Nenhuma alteração necessária - já estão corretamente configurados

-- 5. Verificar operadores e investidores - já têm políticas _ws_insert
-- Nenhuma alteração necessária