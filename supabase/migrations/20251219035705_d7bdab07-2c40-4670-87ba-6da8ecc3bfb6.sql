-- Drop existing functions first
DROP FUNCTION IF EXISTS public.moderate_delete_topic(uuid, text);
DROP FUNCTION IF EXISTS public.moderate_delete_comment(uuid, text);

-- Recreate moderate_delete_topic function using get_user_workspace instead of current_workspace_id
CREATE OR REPLACE FUNCTION public.moderate_delete_topic(
  p_topic_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic RECORD;
  v_workspace_id uuid;
BEGIN
  -- Get topic info and workspace
  SELECT t.*, bc.nome as bookmaker_nome
  INTO v_topic
  FROM community_topics t
  LEFT JOIN bookmakers_catalogo bc ON bc.id = t.bookmaker_catalogo_id
  WHERE t.id = p_topic_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tópico não encontrado');
  END IF;
  
  -- Get workspace using the existing helper function
  v_workspace_id := public.get_user_workspace(auth.uid());
  
  -- Update topic status to DELETED
  UPDATE community_topics
  SET 
    status = 'DELETED',
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = p_reason
  WHERE id = p_topic_id;
  
  -- Also mark all comments as deleted
  UPDATE community_comments
  SET 
    status = 'DELETED',
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = 'Tópico removido'
  WHERE topic_id = p_topic_id AND status != 'DELETED';
  
  -- Log moderation action (using metadata for reason)
  INSERT INTO moderation_logs (
    workspace_id,
    actor_user_id,
    action_type,
    target_type,
    target_id,
    target_content,
    target_author_id,
    metadata
  ) VALUES (
    v_workspace_id,
    auth.uid(),
    'DELETE',
    'topic',
    p_topic_id,
    v_topic.titulo,
    v_topic.user_id,
    jsonb_build_object('reason', p_reason, 'bookmaker', v_topic.bookmaker_nome)
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Recreate moderate_delete_comment function using get_user_workspace
CREATE OR REPLACE FUNCTION public.moderate_delete_comment(
  p_comment_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment RECORD;
  v_workspace_id uuid;
BEGIN
  -- Get comment info
  SELECT c.*, t.titulo as topic_title
  INTO v_comment
  FROM community_comments c
  LEFT JOIN community_topics t ON t.id = c.topic_id
  WHERE c.id = p_comment_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Comentário não encontrado');
  END IF;
  
  -- Get workspace using the existing helper function
  v_workspace_id := public.get_user_workspace(auth.uid());
  
  -- Update comment status to DELETED
  UPDATE community_comments
  SET 
    status = 'DELETED',
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = p_reason
  WHERE id = p_comment_id;
  
  -- Log moderation action (using metadata for reason)
  INSERT INTO moderation_logs (
    workspace_id,
    actor_user_id,
    action_type,
    target_type,
    target_id,
    target_content,
    target_author_id,
    metadata
  ) VALUES (
    v_workspace_id,
    auth.uid(),
    'DELETE',
    'comment',
    p_comment_id,
    LEFT(v_comment.conteudo, 100),
    v_comment.user_id,
    jsonb_build_object('reason', p_reason, 'topic_title', v_comment.topic_title)
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;