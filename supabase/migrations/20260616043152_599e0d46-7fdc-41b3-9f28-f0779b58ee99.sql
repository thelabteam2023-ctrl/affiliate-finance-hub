
-- 1. Estender trigger de enforce workspace match para demais tabelas com operador_id + workspace_id
DROP TRIGGER IF EXISTS trg_cash_ledger_operador_workspace ON public.cash_ledger;
CREATE TRIGGER trg_cash_ledger_operador_workspace
  BEFORE INSERT OR UPDATE OF operador_id, workspace_id ON public.cash_ledger
  FOR EACH ROW EXECUTE FUNCTION public.enforce_operador_workspace_match();

DROP TRIGGER IF EXISTS trg_operador_projetos_operador_workspace ON public.operador_projetos;
CREATE TRIGGER trg_operador_projetos_operador_workspace
  BEFORE INSERT OR UPDATE OF operador_id, workspace_id ON public.operador_projetos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_operador_workspace_match();

DROP TRIGGER IF EXISTS trg_pagamentos_propostos_operador_workspace ON public.pagamentos_propostos;
CREATE TRIGGER trg_pagamentos_propostos_operador_workspace
  BEFORE INSERT OR UPDATE OF operador_id, workspace_id ON public.pagamentos_propostos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_operador_workspace_match();

-- 2. UNIQUE parcial: 1 operador por (workspace, auth_user_id)
CREATE UNIQUE INDEX IF NOT EXISTS operadores_workspace_auth_user_unique
  ON public.operadores (workspace_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- 3. RPC de auto-provisionamento determinístico
CREATE OR REPLACE FUNCTION public.ensure_operador_for_user(
  _auth_user_id uuid,
  _workspace_id uuid,
  _fallback_nome text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operador_id uuid;
  v_nome text;
  v_email text;
  v_display text;
BEGIN
  IF _auth_user_id IS NULL OR _workspace_id IS NULL THEN
    RAISE EXCEPTION 'ensure_operador_for_user: auth_user_id e workspace_id são obrigatórios';
  END IF;

  -- Já existe?
  SELECT id INTO v_operador_id
  FROM public.operadores
  WHERE workspace_id = _workspace_id
    AND auth_user_id = _auth_user_id
  LIMIT 1;

  IF v_operador_id IS NOT NULL THEN
    RETURN v_operador_id;
  END IF;

  -- Resolver nome a partir do profile
  SELECT p.display_name, p.email
    INTO v_display, v_email
  FROM public.profiles p
  WHERE p.id = _auth_user_id
  LIMIT 1;

  v_nome := COALESCE(NULLIF(trim(_fallback_nome), ''),
                     NULLIF(trim(v_display), ''),
                     NULLIF(trim(v_email), ''),
                     'Operador');

  INSERT INTO public.operadores (
    user_id, workspace_id, auth_user_id, nome, email,
    status, tipo_contrato, data_admissao
  ) VALUES (
    _auth_user_id, _workspace_id, _auth_user_id, v_nome, v_email,
    'ATIVO', 'CLT', CURRENT_DATE
  )
  RETURNING id INTO v_operador_id;

  RETURN v_operador_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_operador_for_user(uuid, uuid, text) TO authenticated;
