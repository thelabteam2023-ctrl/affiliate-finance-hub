DROP POLICY IF EXISTS anon_select_supplier_ledger ON public.supplier_ledger;
DROP POLICY IF EXISTS anon_select_supplier_titular_bancos ON public.supplier_titular_bancos;
DROP POLICY IF EXISTS anon_select_supplier_bookmaker_accounts ON public.supplier_bookmaker_accounts;
DROP POLICY IF EXISTS anon_select_supplier_allowed_bookmakers ON public.supplier_allowed_bookmakers;
DROP POLICY IF EXISTS anon_select_supplier_profiles ON public.supplier_profiles;

REVOKE SELECT ON public.supplier_ledger FROM anon;
REVOKE SELECT ON public.supplier_titular_bancos FROM anon;
REVOKE SELECT ON public.supplier_bookmaker_accounts FROM anon;
REVOKE SELECT ON public.supplier_allowed_bookmakers FROM anon;
REVOKE SELECT ON public.supplier_profiles FROM anon;

DROP POLICY IF EXISTS "Audit access" ON public.audit_anomalias;

CREATE POLICY audit_anomalias_authenticated_select
  ON public.audit_anomalias
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.audit_anomalias FROM anon, public;
GRANT SELECT ON public.audit_anomalias TO authenticated;
GRANT ALL ON public.audit_anomalias TO service_role;

DROP POLICY IF EXISTS supplier_evidence_insert ON storage.objects;
DROP POLICY IF EXISTS supplier_evidence_select ON storage.objects;

CREATE POLICY supplier_evidence_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'supplier-evidence');

CREATE POLICY supplier_evidence_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'supplier-evidence');