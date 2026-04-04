-- Add anon SELECT policy to supplier_titulares so the supplier portal can read titular names
CREATE POLICY "anon_select_supplier_titulares"
  ON public.supplier_titulares
  FOR SELECT
  TO anon
  USING (true);

-- Also add anon SELECT policy to supplier_titular_bancos for bank data visibility
CREATE POLICY "anon_select_supplier_titular_bancos"
  ON public.supplier_titular_bancos
  FOR SELECT
  TO anon
  USING (true);