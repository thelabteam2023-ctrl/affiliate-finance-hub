-- Create community chat messages table
CREATE TABLE public.community_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  edited_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

-- Create index for performance (workspace + expires_at for filtering visible messages)
CREATE INDEX idx_chat_messages_workspace_expires ON public.community_chat_messages(workspace_id, expires_at DESC);
CREATE INDEX idx_chat_messages_created ON public.community_chat_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.community_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT - Only workspace members can see messages that haven't expired
CREATE POLICY "Workspace members can view non-expired chat messages"
ON public.community_chat_messages
FOR SELECT
USING (
  workspace_id = get_user_workspace(auth.uid())
  AND expires_at > now()
);

-- RLS Policy: INSERT - PRO+ users or OWNER/ADMIN can insert messages
CREATE POLICY "PRO+ users can send chat messages"
ON public.community_chat_messages
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND workspace_id = get_user_workspace(auth.uid())
  AND (user_has_pro_access(auth.uid()) OR user_is_owner_or_admin(auth.uid()))
);

-- RLS Policy: UPDATE - Author or OWNER/ADMIN can edit
CREATE POLICY "Author or admin can edit chat messages"
ON public.community_chat_messages
FOR UPDATE
USING (
  workspace_id = get_user_workspace(auth.uid())
  AND (
    auth.uid() = user_id
    OR user_is_owner_or_admin(auth.uid())
  )
);

-- Function to cleanup old chat messages (older than 14 days)
CREATE OR REPLACE FUNCTION public.cleanup_expired_chat_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.community_chat_messages
  WHERE created_at < now() - INTERVAL '14 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Enable realtime for chat messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_chat_messages;