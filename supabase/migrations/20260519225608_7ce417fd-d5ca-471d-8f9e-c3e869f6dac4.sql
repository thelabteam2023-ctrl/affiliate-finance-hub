CREATE OR REPLACE FUNCTION public.clear_workspace_chat(target_workspace_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar se o usuário é proprietário (owner) do workspace
  IF NOT EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.workspace_id = target_workspace_id
      AND wm.is_active = true
      AND wm.role = 'owner'
  ) AND NOT public.is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas o proprietário do workspace pode limpar o chat.';
  END IF;

  DELETE FROM public.community_chat_messages
  WHERE workspace_id = target_workspace_id;
END;
$$;