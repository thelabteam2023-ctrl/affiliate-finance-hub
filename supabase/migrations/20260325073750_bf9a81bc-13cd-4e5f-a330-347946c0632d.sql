
-- Secure supplier portal account creation/autofill through supplier-auth token flow

CREATE OR REPLACE FUNCTION public.get_titular_existing_credentials_by_supplier_token(
  p_token_hash text,
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
DECLARE
  v_token RECORD;
BEGIN
  SELECT * INTO v_token
  FROM public.supplier_access_tokens sat
  WHERE sat.token_hash = p_token_hash
    AND sat.revoked_at IS NULL
    AND sat.expires_at > now()
    AND (sat.max_uses IS NULL OR sat.use_count < sat.max_uses)
    AND sat.supplier_workspace_id = (
      SELECT st.supplier_workspace_id
      FROM public.supplier_titulares st
      WHERE st.id = p_titular_id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (b.bookmaker_catalogo_id)
    b.bookmaker_catalogo_id,
    b.login_username,
    b.login_password_encrypted AS login_password
  FROM public.parceiros p
  JOIN public.bookmakers b ON b.parceiro_id = p.id
  WHERE p.supplier_titular_id = p_titular_id
    AND b.bookmaker_catalogo_id IS NOT NULL
    AND lower(b.status) NOT IN ('encerrada')
  ORDER BY b.bookmaker_catalogo_id, b.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_supplier_bookmaker_accounts_by_token(
  p_token_hash text,
  p_titular_id uuid,
  p_accounts jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_account jsonb;
  v_inserted_count integer := 0;
BEGIN
  IF p_accounts IS NULL OR jsonb_typeof(p_accounts) <> 'array' OR jsonb_array_length(p_accounts) = 0 THEN
    RAISE EXCEPTION 'No accounts provided';
  END IF;

  SELECT * INTO v_token
  FROM public.supplier_access_tokens sat
  WHERE sat.token_hash = p_token_hash
    AND sat.revoked_at IS NULL
    AND sat.expires_at > now()
    AND (sat.max_uses IS NULL OR sat.use_count < sat.max_uses)
    AND sat.supplier_workspace_id = (
      SELECT st.supplier_workspace_id
      FROM public.supplier_titulares st
      WHERE st.id = p_titular_id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_account IN SELECT * FROM jsonb_array_elements(p_accounts)
  LOOP
    IF coalesce(trim(v_account->>'bookmaker_catalogo_id'), '') = '' THEN
      RAISE EXCEPTION 'bookmaker_catalogo_id is required';
    END IF;

    IF coalesce(trim(v_account->>'login_username'), '') = '' THEN
      RAISE EXCEPTION 'login_username is required';
    END IF;

    IF coalesce(trim(v_account->>'login_password_encrypted'), '') = '' THEN
      RAISE EXCEPTION 'login_password_encrypted is required';
    END IF;

    IF length(v_account->>'login_username') > 100 THEN
      RAISE EXCEPTION 'login_username too long';
    END IF;

    INSERT INTO public.supplier_bookmaker_accounts (
      supplier_workspace_id,
      titular_id,
      bookmaker_catalogo_id,
      login_username,
      login_password_encrypted,
      moeda
    )
    VALUES (
      v_token.supplier_workspace_id,
      p_titular_id,
      (v_account->>'bookmaker_catalogo_id')::uuid,
      trim(v_account->>'login_username'),
      trim(v_account->>'login_password_encrypted'),
      coalesce(nullif(trim(v_account->>'moeda'), ''), 'BRL')
    );

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN v_inserted_count;
END;
$$;
