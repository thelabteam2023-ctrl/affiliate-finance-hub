
-- Restore anon SELECT policy for supplier_titulares (supplier portal token access)
CREATE POLICY "anon_select_supplier_titulares"
ON public.supplier_titulares
FOR SELECT
TO anon
USING (check_supplier_workspace_access(supplier_workspace_id));

-- Also add anon INSERT/UPDATE for portal operations
CREATE POLICY "anon_insert_supplier_titulares"
ON public.supplier_titulares
FOR INSERT
TO anon
WITH CHECK (check_supplier_workspace_access(supplier_workspace_id));

CREATE POLICY "anon_update_supplier_titulares"
ON public.supplier_titulares
FOR UPDATE
TO anon
USING (check_supplier_workspace_access(supplier_workspace_id))
WITH CHECK (check_supplier_workspace_access(supplier_workspace_id));
