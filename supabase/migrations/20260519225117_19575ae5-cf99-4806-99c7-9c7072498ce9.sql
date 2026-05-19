CREATE OR REPLACE FUNCTION public.cleanup_expired_chat_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Deleta mensagens com mais de 15 dias
  DELETE FROM public.community_chat_messages
  WHERE created_at < (now() - interval '15 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;