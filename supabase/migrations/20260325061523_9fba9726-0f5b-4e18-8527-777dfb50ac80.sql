
-- Allow anon role to SELECT supplier_titulares (for supplier portal token-based access)
CREATE POLICY "anon_select_supplier_titulares"
ON public.supplier_titulares
FOR SELECT
TO anon
USING (true);

-- Also add for supplier_ledger and supplier_bookmaker_accounts if not already present
CREATE POLICY "anon_select_supplier_ledger"
ON public.supplier_ledger
FOR SELECT
TO anon
USING (true);

CREATE POLICY "anon_select_supplier_bookmaker_accounts"
ON public.supplier_bookmaker_accounts
FOR SELECT
TO anon
USING (true);
