-- Revoga EXECUTE de 'anon' em todas as funções SECURITY DEFINER do schema public.
-- Mantém acesso para 'authenticated' e 'service_role'.
DO $$
DECLARE
  func_record RECORD;
  revoke_sql TEXT;
BEGIN
  FOR func_record IN
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    revoke_sql := format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
      func_record.schema_name,
      func_record.function_name,
      func_record.args
    );
    EXECUTE revoke_sql;
  END LOOP;
END $$;