
-- Função SECURITY DEFINER que retorna membros ativos de um workspace com seus perfis.
-- Contorna o RLS circular entre workspace_members e profiles de forma segura.
CREATE OR REPLACE FUNCTION public.get_workspace_members_with_profiles(_workspace_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    wm.user_id,
    p.full_name,
    p.email,
    wm.role
  FROM public.workspace_members wm
  JOIN public.profiles p ON p.id = wm.user_id
  WHERE wm.workspace_id = _workspace_id
    AND wm.is_active = true
    AND EXISTS (
      SELECT 1 FROM public.workspace_members caller
      WHERE caller.user_id = auth.uid()
        AND caller.workspace_id = _workspace_id
        AND caller.is_active = true
    )
  ORDER BY p.full_name ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_members_with_profiles(uuid) TO authenticated;
