-- Criar RPC para buscar membros do workspace com dados enriquecidos
-- Essa função é SECURITY DEFINER para poder acessar profiles de outros usuários
CREATE OR REPLACE FUNCTION public.get_workspace_members_enriched(_workspace_id UUID)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  role app_role,
  is_active BOOLEAN,
  joined_at TIMESTAMPTZ,
  email TEXT,
  full_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar se o usuário atual é membro ativo do workspace
  IF NOT EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = _workspace_id
    AND wm.user_id = auth.uid()
    AND wm.is_active = true
  ) THEN
    RAISE EXCEPTION 'Sem permissão para ver membros deste workspace';
  END IF;

  RETURN QUERY
  SELECT 
    wm.id,
    wm.user_id,
    wm.role,
    wm.is_active,
    wm.joined_at,
    COALESCE(p.email, 'Email não disponível') as email,
    COALESCE(p.full_name, '') as full_name
  FROM workspace_members wm
  LEFT JOIN profiles p ON p.id = wm.user_id
  WHERE wm.workspace_id = _workspace_id
  AND wm.is_active = true
  ORDER BY wm.joined_at ASC;
END;
$$;