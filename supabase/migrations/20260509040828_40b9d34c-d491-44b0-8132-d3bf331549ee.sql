-- 1. Indexing for RBAC and Workspace Resolution
CREATE INDEX IF NOT EXISTS idx_profiles_default_workspace ON public.profiles(default_workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_active_created ON public.workspace_members(user_id, is_active, created_at);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_lookup ON public.user_permission_overrides(user_id, workspace_id, granted) WHERE granted = true;

-- 2. Indexing for Crypto Wallets
CREATE INDEX IF NOT EXISTS idx_wallets_crypto_parceiro_id ON public.wallets_crypto(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_wallets_crypto_rede_id ON public.wallets_crypto(rede_id);
CREATE INDEX IF NOT EXISTS idx_wallets_crypto_label ON public.wallets_crypto(label);

-- 3. Indexing for Transactions/Requests (heavy tables)
CREATE INDEX IF NOT EXISTS idx_solicitacoes_workspace_status ON public.solicitacoes(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_requerente_created ON public.solicitacoes(requerente_id, created_at);
CREATE INDEX IF NOT EXISTS idx_apostas_unificada_ws_data ON public.apostas_unificada(workspace_id, data_aposta DESC);

-- 4. Audit and Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_id ON public.audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
