
-- CORREÇÃO CRÍTICA DE SEGURANÇA: Corrigir get_current_workspace para usar default_workspace_id
-- Isso garante que o RLS filtre dados pelo workspace ativo escolhido pelo usuário

-- Corrigir get_current_workspace
CREATE OR REPLACE FUNCTION public.get_current_workspace()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Primeiro: usar default_workspace_id do profile
    (SELECT default_workspace_id FROM public.profiles WHERE id = auth.uid()),
    -- Fallback: primeiro workspace onde o usuário é membro ativo
    (SELECT workspace_id FROM public.workspace_members 
     WHERE user_id = auth.uid() AND is_active = true 
     ORDER BY created_at ASC 
     LIMIT 1)
  )
$$;

-- Corrigir get_user_workspace
CREATE OR REPLACE FUNCTION public.get_user_workspace(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Primeiro: usar default_workspace_id do profile
    (SELECT default_workspace_id FROM public.profiles WHERE id = _user_id),
    -- Fallback: primeiro workspace onde o usuário é membro ativo
    (SELECT workspace_id FROM public.workspace_members 
     WHERE user_id = _user_id AND is_active = true 
     ORDER BY created_at ASC 
     LIMIT 1)
  )
$$;
