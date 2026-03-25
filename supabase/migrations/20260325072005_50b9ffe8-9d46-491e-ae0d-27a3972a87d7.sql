
-- Create a security definer function to check supplier workspace access
CREATE OR REPLACE FUNCTION public.check_supplier_workspace_access(
  p_supplier_workspace_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM supplier_profiles sp
    JOIN workspace_members wm ON wm.workspace_id = sp.parent_workspace_id
    WHERE sp.workspace_id = p_supplier_workspace_id
      AND wm.user_id = auth.uid()
  )
$$;

-- Drop old policy and recreate with explicit WITH CHECK
DROP POLICY IF EXISTS workspace_members_supplier_accounts ON public.supplier_bookmaker_accounts;

CREATE POLICY "workspace_members_supplier_accounts" ON public.supplier_bookmaker_accounts
  FOR ALL
  TO authenticated
  USING (public.check_supplier_workspace_access(supplier_workspace_id))
  WITH CHECK (public.check_supplier_workspace_access(supplier_workspace_id));
