-- Corrigir get_workspace_invites para retornar o token
DROP FUNCTION IF EXISTS public.get_workspace_invites(UUID);

CREATE OR REPLACE FUNCTION public.get_workspace_invites(_workspace_id UUID)
RETURNS TABLE(
  id UUID,
  email TEXT,
  role app_role,
  status TEXT,
  token UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  created_by_email TEXT,
  created_by_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar permissão
  IF NOT public.is_owner_or_admin(auth.uid(), _workspace_id) THEN
    RAISE EXCEPTION 'Sem permissão para ver convites';
  END IF;

  RETURN QUERY
  SELECT 
    wi.id,
    wi.email,
    wi.role,
    CASE 
      WHEN wi.status = 'pending' AND wi.expires_at < now() THEN 'expired'::TEXT
      ELSE wi.status
    END as status,
    wi.token,
    wi.expires_at,
    wi.created_at,
    p.email as created_by_email,
    p.full_name as created_by_name
  FROM workspace_invites wi
  LEFT JOIN profiles p ON p.id = wi.created_by
  WHERE wi.workspace_id = _workspace_id
  ORDER BY 
    CASE wi.status 
      WHEN 'pending' THEN 1 
      WHEN 'expired' THEN 2 
      ELSE 3 
    END,
    wi.created_at DESC;
END;
$$;