ALTER TABLE public.community_chat_messages
  DROP CONSTRAINT IF EXISTS community_chat_messages_context_type_check;

ALTER TABLE public.community_chat_messages
  ADD CONSTRAINT community_chat_messages_context_type_check
  CHECK (context_type = ANY (ARRAY['general'::text, 'bookmaker'::text, 'topic'::text, 'workspace'::text]));