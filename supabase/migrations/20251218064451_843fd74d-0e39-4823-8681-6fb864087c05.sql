-- Add new columns to community_chat_messages for contextual chat
ALTER TABLE public.community_chat_messages 
ADD COLUMN IF NOT EXISTS context_type text NOT NULL DEFAULT 'general',
ADD COLUMN IF NOT EXISTS context_id uuid NULL,
ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';

-- Add constraint for context_type
ALTER TABLE public.community_chat_messages
ADD CONSTRAINT community_chat_messages_context_type_check 
CHECK (context_type IN ('general', 'bookmaker'));

-- Add constraint for message_type  
ALTER TABLE public.community_chat_messages
ADD CONSTRAINT community_chat_messages_message_type_check 
CHECK (message_type IN ('text', 'image', 'audio'));

-- Add index for context queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_context 
ON public.community_chat_messages (workspace_id, context_type, context_id, expires_at DESC);

-- Update default expires_at to 3 days instead of 7
ALTER TABLE public.community_chat_messages 
ALTER COLUMN expires_at SET DEFAULT (now() + interval '3 days');

-- Update cleanup function to remove after 7 days instead of 14
CREATE OR REPLACE FUNCTION public.cleanup_expired_chat_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.community_chat_messages
  WHERE created_at < now() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Create storage bucket for chat media
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-media', 'chat-media', false, 3145728)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat-media bucket
CREATE POLICY "Authenticated users can upload chat media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-media' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view chat media from their workspace"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-media'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete their own chat media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chat-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);