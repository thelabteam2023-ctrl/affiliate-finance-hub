-- Habilitar exclusão de mensagens
ALTER TABLE public.community_chat_messages ENABLE ROW LEVEL SECURITY;

-- Política: Usuário pode deletar sua própria mensagem em até 5 minutos
CREATE POLICY "Users can delete their own messages within 5 minutes"
ON public.community_chat_messages
FOR DELETE
USING (
  auth.uid() = user_id 
  AND created_at > (now() - interval '5 minutes')
);

-- Política: Admins/Owners podem deletar qualquer mensagem do workspace
CREATE POLICY "Admins can delete any message"
ON public.community_chat_messages
FOR DELETE
USING (
  user_is_owner_or_admin_in_workspace(auth.uid(), workspace_id)
);

-- Função para limpeza total (Admin)
CREATE OR REPLACE FUNCTION public.clear_workspace_chat(target_workspace_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar se o usuário é admin/owner
  IF NOT user_is_owner_or_admin_in_workspace(auth.uid(), target_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem limpar o chat.';
  END IF;

  DELETE FROM public.community_chat_messages
  WHERE workspace_id = target_workspace_id;
END;
$$;

-- Trigger para limpar Storage (Imagens órfãs)
-- Nota: Isso requer que as permissões de storage permitam a exclusão via trigger/service role
-- Se não for possível via SQL direto, será tratado via Edge Function periódica.
