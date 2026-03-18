
-- Helper function: check if user is admin/owner/finance in workspace (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_privileged_role(_user_id UUID, _workspace_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws UUID;
  v_role public.app_role;
BEGIN
  IF public.is_system_owner(_user_id) THEN RETURN TRUE; END IF;
  
  v_ws := COALESCE(_workspace_id, public.get_user_workspace(_user_id));
  IF v_ws IS NULL THEN RETURN FALSE; END IF;
  
  v_role := public.get_user_role(_user_id, v_ws);
  RETURN v_role IN ('owner', 'admin', 'finance');
END;
$$;

-- INVESTIDORES: Replace open SELECT with privileged-only SELECT
DROP POLICY IF EXISTS "investidores_ws_select" ON public.investidores;
CREATE POLICY "investidores_ws_select" ON public.investidores
  FOR SELECT TO authenticated
  USING (
    workspace_id = get_current_workspace()
    AND public.is_privileged_role(auth.uid(), workspace_id)
  );

-- INDICADORES_REFERRAL: Replace open SELECT with privileged-only SELECT
DROP POLICY IF EXISTS "indicadores_ws_select" ON public.indicadores_referral;
CREATE POLICY "indicadores_ws_select" ON public.indicadores_referral
  FOR SELECT TO authenticated
  USING (
    workspace_id = get_current_workspace()
    AND public.is_privileged_role(auth.uid(), workspace_id)
  );

-- Also restrict INSERT/UPDATE/DELETE on indicadores_referral to privileged roles
DROP POLICY IF EXISTS "indicadores_ws_insert" ON public.indicadores_referral;
CREATE POLICY "indicadores_ws_insert" ON public.indicadores_referral
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id = get_current_workspace()
    AND public.is_privileged_role(auth.uid(), workspace_id)
  );

DROP POLICY IF EXISTS "indicadores_ws_update" ON public.indicadores_referral;
CREATE POLICY "indicadores_ws_update" ON public.indicadores_referral
  FOR UPDATE TO authenticated
  USING (
    workspace_id = get_current_workspace()
    AND public.is_privileged_role(auth.uid(), workspace_id)
  );

DROP POLICY IF EXISTS "indicadores_ws_delete" ON public.indicadores_referral;
CREATE POLICY "indicadores_ws_delete" ON public.indicadores_referral
  FOR DELETE TO authenticated
  USING (
    workspace_id = get_current_workspace()
    AND public.is_privileged_role(auth.uid(), workspace_id)
  );
