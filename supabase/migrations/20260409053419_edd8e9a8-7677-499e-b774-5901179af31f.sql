
-- Fix: anon SELECT on supplier_titulares uses auth.uid() which is null for portal token users
-- Match the pattern of other supplier tables (supplier_bookmaker_accounts, supplier_titular_bancos)
DROP POLICY IF EXISTS "anon_select_supplier_titulares" ON public.supplier_titulares;

CREATE POLICY "anon_select_supplier_titulares"
  ON public.supplier_titulares
  FOR SELECT
  TO anon
  USING (true);
