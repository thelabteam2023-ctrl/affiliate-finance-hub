
-- 1. FIX CRITICAL: Rewrite get_titular_existing_credentials with authorization check
CREATE OR REPLACE FUNCTION public.get_titular_existing_credentials(
  p_titular_id uuid
)
RETURNS TABLE(
  bookmaker_catalogo_id uuid,
  login_username text,
  login_password text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: verify caller has access to a workspace that manages this titular
  IF NOT EXISTS (
    SELECT 1
    FROM supplier_titulares st
    JOIN supplier_profiles sp ON sp.workspace_id = st.supplier_workspace_id
    JOIN workspace_members wm ON wm.workspace_id = sp.parent_workspace_id
    WHERE st.id = p_titular_id
      AND wm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: you do not have permission to access this titular';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (b.bookmaker_catalogo_id)
    b.bookmaker_catalogo_id,
    b.login_username,
    b.login_password_encrypted AS login_password
  FROM parceiros p
  JOIN bookmakers b ON b.parceiro_id = p.id
  WHERE p.supplier_titular_id = p_titular_id
    AND b.bookmaker_catalogo_id IS NOT NULL
    AND lower(b.status) NOT IN ('encerrada')
  ORDER BY b.bookmaker_catalogo_id, b.created_at DESC;
END;
$$;

-- 2. FIX CRITICAL: Remove anonymous access to supplier accounts
DROP POLICY IF EXISTS anon_select_supplier_bookmaker_accounts ON public.supplier_bookmaker_accounts;

-- 3. Also remove anon access from supplier_ledger and supplier_profiles if exists
DROP POLICY IF EXISTS anon_select_supplier_ledger ON public.supplier_ledger;
DROP POLICY IF EXISTS anon_select_supplier_profiles ON public.supplier_profiles;
