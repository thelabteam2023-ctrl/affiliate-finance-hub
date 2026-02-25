-- Add has_chat_activity flag to community_topics
ALTER TABLE public.community_topics 
ADD COLUMN IF NOT EXISTS has_chat_activity boolean NOT NULL DEFAULT false;

-- Update context_type check constraint on community_chat_messages to allow 'topic'
DO $$
BEGIN
  -- Drop existing check if any
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_chat_messages_context_type_check' AND conrelid = 'public.community_chat_messages'::regclass) THEN
    ALTER TABLE public.community_chat_messages DROP CONSTRAINT community_chat_messages_context_type_check;
  END IF;
END$$;

-- Add updated check constraint
ALTER TABLE public.community_chat_messages 
ADD CONSTRAINT community_chat_messages_context_type_check 
CHECK (context_type IN ('general', 'bookmaker', 'topic'));

-- Create trigger to mark topic as having chat activity on first message
CREATE OR REPLACE FUNCTION public.mark_topic_chat_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.context_type = 'topic' AND NEW.context_id IS NOT NULL THEN
    UPDATE public.community_topics 
    SET has_chat_activity = true 
    WHERE id = NEW.context_id AND has_chat_activity = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_topic_chat_activity ON public.community_chat_messages;
CREATE TRIGGER trg_mark_topic_chat_activity
AFTER INSERT ON public.community_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.mark_topic_chat_activity();