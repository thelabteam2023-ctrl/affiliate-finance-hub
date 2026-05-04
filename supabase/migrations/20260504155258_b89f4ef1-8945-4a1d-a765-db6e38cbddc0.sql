-- 1. Standardize get_current_workspace to be more robust
CREATE OR REPLACE FUNCTION public.get_current_workspace()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH hdr AS (
    SELECT public.try_cast_uuid(
      (coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-workspace-id')
    ) AS wid
  )
  SELECT COALESCE(
    -- 1) Request-scoped header (validated membership)
    (SELECT wid FROM hdr WHERE wid IS NOT NULL AND public.is_active_workspace_member(auth.uid(), wid)),
    -- 2) Profile default
    (SELECT default_workspace_id FROM public.profiles WHERE id = auth.uid()),
    -- 3) First active membership
    (SELECT workspace_id
     FROM public.workspace_members
     WHERE user_id = auth.uid() AND is_active = true
     ORDER BY created_at ASC
     LIMIT 1)
  );
$function$;

-- 2. Set security_invoker = true for all views to respect RLS
DO $$
DECLARE
    v_name TEXT;
BEGIN
    FOR v_name IN 
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_schema = 'public' 
    LOOP
        EXECUTE format('ALTER VIEW %I SET (security_invoker = true)', v_name);
    END LOOP;
END $$;

-- 3. Strengthen policies for key tables
-- parceiros
DROP POLICY IF EXISTS "parceiros_ws_select" ON "parceiros";
CREATE POLICY "parceiros_ws_select" ON "parceiros" FOR SELECT USING (workspace_id = get_current_workspace());

-- bookmakers
DROP POLICY IF EXISTS "bookmakers_ws_select" ON "bookmakers";
CREATE POLICY "bookmakers_ws_select" ON "bookmakers" FOR SELECT USING (workspace_id = get_current_workspace());

-- cash_ledger
DROP POLICY IF EXISTS "cash_ledger_select_policy" ON "cash_ledger";
CREATE POLICY "cash_ledger_select_policy" ON "cash_ledger" FOR SELECT USING (workspace_id = get_current_workspace());

-- wallets_crypto
DROP POLICY IF EXISTS "wallets_crypto_select" ON "wallets_crypto";
CREATE POLICY "wallets_crypto_select" ON "wallets_crypto" FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM parceiros 
    WHERE parceiros.id = wallets_crypto.parceiro_id 
    AND parceiros.workspace_id = get_current_workspace()
  )
);

-- accounts/contas_bancarias
DROP POLICY IF EXISTS "contas_bancarias_ws_select" ON "contas_bancarias";
ALTER TABLE "contas_bancarias" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contas_bancarias_ws_select" ON "contas_bancarias" FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM parceiros 
    WHERE parceiros.id = contas_bancarias.parceiro_id 
    AND parceiros.workspace_id = get_current_workspace()
  )
);

-- transacoes_bookmakers
DROP POLICY IF EXISTS "Users can view own bookmaker transactions" ON "transacoes_bookmakers";
CREATE POLICY "transacoes_bookmakers_ws_select" ON "transacoes_bookmakers" FOR SELECT 
USING (workspace_id = get_current_workspace());

-- bookmaker_balance_audit
DROP POLICY IF EXISTS "Users can view audit logs in their workspace" ON "bookmaker_balance_audit";
CREATE POLICY "bookmaker_balance_audit_ws_select" ON "bookmaker_balance_audit" FOR SELECT 
USING (workspace_id = get_current_workspace());

-- project_bookmaker_link_bonuses
DROP POLICY IF EXISTS "proj_bk_bonuses_ws_select" ON "project_bookmaker_link_bonuses";
CREATE POLICY "proj_bk_bonuses_ws_select" ON "project_bookmaker_link_bonuses" FOR SELECT 
USING (workspace_id = get_current_workspace());
