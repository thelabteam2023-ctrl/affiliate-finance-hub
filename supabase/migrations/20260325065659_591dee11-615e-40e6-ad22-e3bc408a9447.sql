
CREATE OR REPLACE FUNCTION public.get_titular_existing_credentials(
  p_titular_id uuid
)
RETURNS TABLE(
  bookmaker_catalogo_id uuid,
  login_username text,
  login_password text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (b.bookmaker_catalogo_id)
    b.bookmaker_catalogo_id,
    b.login_username,
    b.login_password_encrypted AS login_password
  FROM parceiros p
  JOIN bookmakers b ON b.parceiro_id = p.id
  WHERE p.supplier_titular_id = p_titular_id
    AND b.bookmaker_catalogo_id IS NOT NULL
    AND b.status NOT IN ('ENCERRADA')
  ORDER BY b.bookmaker_catalogo_id, b.created_at DESC
$$;
