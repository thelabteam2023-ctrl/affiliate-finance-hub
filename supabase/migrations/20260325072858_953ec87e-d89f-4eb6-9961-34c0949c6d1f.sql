
-- FIX: Restaurar acesso anon para portal do fornecedor (usa token, não Supabase Auth)

CREATE POLICY "anon_select_supplier_bookmaker_accounts"
  ON public.supplier_bookmaker_accounts
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon_select_supplier_ledger"
  ON public.supplier_ledger
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon_select_supplier_profiles"
  ON public.supplier_profiles
  FOR SELECT TO anon
  USING (true);

-- FIX RPC: Remover auth.uid() que falha para anon
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
  IF NOT EXISTS (
    SELECT 1 FROM supplier_titulares WHERE id = p_titular_id
  ) THEN
    RAISE EXCEPTION 'Titular not found';
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
