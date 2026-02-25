
-- =============================================
-- SECURITY HARDENING: Restrict all sensitive table policies to authenticated role only
-- This prevents any theoretical access via the anon key
-- =============================================

-- 1. APOSTAS_UNIFICADA: Change from public to authenticated
DROP POLICY IF EXISTS "apostas_unificada_select" ON public.apostas_unificada;
DROP POLICY IF EXISTS "apostas_unificada_insert" ON public.apostas_unificada;
DROP POLICY IF EXISTS "apostas_unificada_update" ON public.apostas_unificada;
DROP POLICY IF EXISTS "apostas_unificada_delete" ON public.apostas_unificada;

CREATE POLICY "apostas_unificada_select" ON public.apostas_unificada
  FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace());

CREATE POLICY "apostas_unificada_insert" ON public.apostas_unificada
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND workspace_id = get_current_workspace() AND user_id = auth.uid());

CREATE POLICY "apostas_unificada_update" ON public.apostas_unificada
  FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace());

CREATE POLICY "apostas_unificada_delete" ON public.apostas_unificada
  FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace());

-- 2. BOOKMAKERS: SELECT/UPDATE from public to authenticated
DROP POLICY IF EXISTS "bookmakers_ws_select" ON public.bookmakers;
DROP POLICY IF EXISTS "bookmakers_ws_update" ON public.bookmakers;

CREATE POLICY "bookmakers_ws_select" ON public.bookmakers
  FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace());

CREATE POLICY "bookmakers_ws_update" ON public.bookmakers
  FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace() AND (has_permission(auth.uid(), 'bookmakers.accounts.edit', workspace_id) OR has_permission(auth.uid(), 'bookmakers.accounts.status', workspace_id)));

-- 3. CASH_LEDGER: All from public to authenticated
DROP POLICY IF EXISTS "cash_ledger_select_policy" ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_insert_policy" ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_update_policy" ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_delete_policy" ON public.cash_ledger;

CREATE POLICY "cash_ledger_select_policy" ON public.cash_ledger
  FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace());

CREATE POLICY "cash_ledger_insert_policy" ON public.cash_ledger
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid() AND workspace_id = get_current_workspace());

CREATE POLICY "cash_ledger_update_policy" ON public.cash_ledger
  FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace() AND is_workspace_owner_or_admin(auth.uid(), workspace_id));

CREATE POLICY "cash_ledger_delete_policy" ON public.cash_ledger
  FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace() AND EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.user_id = auth.uid()
      AND workspace_members.workspace_id = cash_ledger.workspace_id
      AND workspace_members.is_active = true
      AND workspace_members.role = 'owner'
  ));

-- 4. CONTAS_BANCARIAS: All from public to authenticated
DROP POLICY IF EXISTS "Users with parceiros.read can view bank accounts" ON public.contas_bancarias;
DROP POLICY IF EXISTS "Users with parceiros.edit can insert bank accounts" ON public.contas_bancarias;
DROP POLICY IF EXISTS "Users with parceiros.edit can update bank accounts" ON public.contas_bancarias;
DROP POLICY IF EXISTS "Users with parceiros.delete can delete bank accounts" ON public.contas_bancarias;

CREATE POLICY "contas_bancarias_select" ON public.contas_bancarias
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM parceiros WHERE parceiros.id = contas_bancarias.parceiro_id AND parceiros.workspace_id = get_current_workspace()) AND has_permission(auth.uid(), 'parceiros.read', get_current_workspace()));

CREATE POLICY "contas_bancarias_insert" ON public.contas_bancarias
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM parceiros WHERE parceiros.id = contas_bancarias.parceiro_id AND parceiros.workspace_id = get_current_workspace()) AND has_permission(auth.uid(), 'parceiros.edit', get_current_workspace()));

CREATE POLICY "contas_bancarias_update" ON public.contas_bancarias
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM parceiros WHERE parceiros.id = contas_bancarias.parceiro_id AND parceiros.workspace_id = get_current_workspace()) AND has_permission(auth.uid(), 'parceiros.edit', get_current_workspace()));

CREATE POLICY "contas_bancarias_delete" ON public.contas_bancarias
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM parceiros WHERE parceiros.id = contas_bancarias.parceiro_id AND parceiros.workspace_id = get_current_workspace()) AND has_permission(auth.uid(), 'parceiros.delete', get_current_workspace()));

-- 5. WALLETS_CRYPTO: All from public to authenticated
DROP POLICY IF EXISTS "Users with parceiros.read can view crypto wallets" ON public.wallets_crypto;
DROP POLICY IF EXISTS "Users with parceiros.edit can insert crypto wallets" ON public.wallets_crypto;
DROP POLICY IF EXISTS "Users with parceiros.edit can update crypto wallets" ON public.wallets_crypto;
DROP POLICY IF EXISTS "Users with parceiros.delete can delete crypto wallets" ON public.wallets_crypto;

CREATE POLICY "wallets_crypto_select" ON public.wallets_crypto
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM parceiros WHERE parceiros.id = wallets_crypto.parceiro_id AND parceiros.workspace_id = get_current_workspace()) AND has_permission(auth.uid(), 'parceiros.read', get_current_workspace()));

CREATE POLICY "wallets_crypto_insert" ON public.wallets_crypto
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM parceiros WHERE parceiros.id = wallets_crypto.parceiro_id AND parceiros.workspace_id = get_current_workspace()) AND has_permission(auth.uid(), 'parceiros.edit', get_current_workspace()));

CREATE POLICY "wallets_crypto_update" ON public.wallets_crypto
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM parceiros WHERE parceiros.id = wallets_crypto.parceiro_id AND parceiros.workspace_id = get_current_workspace()) AND has_permission(auth.uid(), 'parceiros.edit', get_current_workspace()));

CREATE POLICY "wallets_crypto_delete" ON public.wallets_crypto
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM parceiros WHERE parceiros.id = wallets_crypto.parceiro_id AND parceiros.workspace_id = get_current_workspace()) AND has_permission(auth.uid(), 'parceiros.delete', get_current_workspace()));

-- 6. DESPESAS_ADMINISTRATIVAS: All from public to authenticated
DROP POLICY IF EXISTS "despesas_ws_select" ON public.despesas_administrativas;
DROP POLICY IF EXISTS "despesas_ws_insert" ON public.despesas_administrativas;
DROP POLICY IF EXISTS "despesas_ws_update" ON public.despesas_administrativas;
DROP POLICY IF EXISTS "despesas_ws_delete" ON public.despesas_administrativas;

CREATE POLICY "despesas_ws_select" ON public.despesas_administrativas
  FOR SELECT TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "despesas_ws_insert" ON public.despesas_administrativas
  FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace());
CREATE POLICY "despesas_ws_update" ON public.despesas_administrativas
  FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "despesas_ws_delete" ON public.despesas_administrativas
  FOR DELETE TO authenticated USING (workspace_id = get_current_workspace());

-- 7. FORNECEDORES: All from public to authenticated
DROP POLICY IF EXISTS "fornecedores_ws_select" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores_ws_insert" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores_ws_update" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores_ws_delete" ON public.fornecedores;

CREATE POLICY "fornecedores_ws_select" ON public.fornecedores
  FOR SELECT TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "fornecedores_ws_insert" ON public.fornecedores
  FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace());
CREATE POLICY "fornecedores_ws_update" ON public.fornecedores
  FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "fornecedores_ws_delete" ON public.fornecedores
  FOR DELETE TO authenticated USING (workspace_id = get_current_workspace());

-- 8. INDICADORES_REFERRAL: All from public to authenticated
DROP POLICY IF EXISTS "indicadores_ws_select" ON public.indicadores_referral;
DROP POLICY IF EXISTS "indicadores_ws_insert" ON public.indicadores_referral;
DROP POLICY IF EXISTS "indicadores_ws_update" ON public.indicadores_referral;
DROP POLICY IF EXISTS "indicadores_ws_delete" ON public.indicadores_referral;

CREATE POLICY "indicadores_ws_select" ON public.indicadores_referral
  FOR SELECT TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "indicadores_ws_insert" ON public.indicadores_referral
  FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace());
CREATE POLICY "indicadores_ws_update" ON public.indicadores_referral
  FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "indicadores_ws_delete" ON public.indicadores_referral
  FOR DELETE TO authenticated USING (workspace_id = get_current_workspace());

-- 9. INVESTIDORES: SELECT from public to authenticated
DROP POLICY IF EXISTS "investidores_ws_select" ON public.investidores;

CREATE POLICY "investidores_ws_select" ON public.investidores
  FOR SELECT TO authenticated USING (workspace_id = get_current_workspace());

-- 10. OPERADORES: SELECT from public to authenticated
DROP POLICY IF EXISTS "operadores_ws_select" ON public.operadores;

CREATE POLICY "operadores_ws_select" ON public.operadores
  FOR SELECT TO authenticated USING (workspace_id = get_current_workspace());

-- 11. PAGAMENTOS_OPERADOR: All from public to authenticated
DROP POLICY IF EXISTS "pagto_op_ws_select" ON public.pagamentos_operador;
DROP POLICY IF EXISTS "pagto_op_ws_insert" ON public.pagamentos_operador;
DROP POLICY IF EXISTS "pagto_op_ws_update" ON public.pagamentos_operador;
DROP POLICY IF EXISTS "pagto_op_ws_delete" ON public.pagamentos_operador;

CREATE POLICY "pagto_op_ws_select" ON public.pagamentos_operador
  FOR SELECT TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "pagto_op_ws_insert" ON public.pagamentos_operador
  FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace());
CREATE POLICY "pagto_op_ws_update" ON public.pagamentos_operador
  FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "pagto_op_ws_delete" ON public.pagamentos_operador
  FOR DELETE TO authenticated USING (workspace_id = get_current_workspace());

-- 12. PARCEIROS: SELECT from public to authenticated
DROP POLICY IF EXISTS "parceiros_ws_select" ON public.parceiros;

CREATE POLICY "parceiros_ws_select" ON public.parceiros
  FOR SELECT TO authenticated USING (workspace_id = get_current_workspace());

-- 13. PARCERIAS: All from public to authenticated
DROP POLICY IF EXISTS "parcerias_ws_select" ON public.parcerias;
DROP POLICY IF EXISTS "parcerias_ws_insert" ON public.parcerias;
DROP POLICY IF EXISTS "parcerias_ws_update" ON public.parcerias;
DROP POLICY IF EXISTS "parcerias_ws_delete" ON public.parcerias;

CREATE POLICY "parcerias_ws_select" ON public.parcerias
  FOR SELECT TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "parcerias_ws_insert" ON public.parcerias
  FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace());
CREATE POLICY "parcerias_ws_update" ON public.parcerias
  FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "parcerias_ws_delete" ON public.parcerias
  FOR DELETE TO authenticated USING (workspace_id = get_current_workspace());

-- 14. PROJETO_CICLOS: All from public to authenticated
DROP POLICY IF EXISTS "proj_ciclos_ws_select" ON public.projeto_ciclos;
DROP POLICY IF EXISTS "proj_ciclos_ws_insert" ON public.projeto_ciclos;
DROP POLICY IF EXISTS "proj_ciclos_ws_update" ON public.projeto_ciclos;
DROP POLICY IF EXISTS "proj_ciclos_ws_delete" ON public.projeto_ciclos;

CREATE POLICY "proj_ciclos_ws_select" ON public.projeto_ciclos
  FOR SELECT TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "proj_ciclos_ws_insert" ON public.projeto_ciclos
  FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace());
CREATE POLICY "proj_ciclos_ws_update" ON public.projeto_ciclos
  FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace());
CREATE POLICY "proj_ciclos_ws_delete" ON public.projeto_ciclos
  FOR DELETE TO authenticated USING (workspace_id = get_current_workspace());

-- 15. PROFILES: Fix duplicate SELECT, ensure authenticated only
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Membros podem ver perfis de colegas do workspace" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id 
    OR EXISTS (
      SELECT 1 FROM workspace_members wm1
      JOIN workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
      WHERE wm1.user_id = auth.uid() AND wm2.user_id = profiles.id
        AND wm1.is_active = true AND wm2.is_active = true
    )
  );

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- 16. COMMUNITY CHAT MESSAGES: Harden to authenticated
DROP POLICY IF EXISTS "Workspace members can view non-expired chat messages" ON public.community_chat_messages;
DROP POLICY IF EXISTS "PRO+ users can send chat messages" ON public.community_chat_messages;
DROP POLICY IF EXISTS "Author or admin can edit chat messages" ON public.community_chat_messages;

CREATE POLICY "chat_messages_select" ON public.community_chat_messages
  FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace() AND expires_at > now());

CREATE POLICY "chat_messages_insert" ON public.community_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND workspace_id = get_current_workspace() AND (user_has_pro_access(auth.uid()) OR user_is_owner_or_admin(auth.uid())));

CREATE POLICY "chat_messages_update" ON public.community_chat_messages
  FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace() AND (auth.uid() = user_id OR user_is_owner_or_admin(auth.uid())));
