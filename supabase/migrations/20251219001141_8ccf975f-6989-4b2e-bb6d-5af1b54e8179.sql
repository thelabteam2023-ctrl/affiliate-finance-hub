
-- 1) Drop existing check constraints
ALTER TABLE public.community_topics DROP CONSTRAINT IF EXISTS community_topics_status_check;
ALTER TABLE public.community_comments DROP CONSTRAINT IF EXISTS community_comments_status_check;

-- 2) Add new check constraints with 'DELETED' status included
ALTER TABLE public.community_topics 
ADD CONSTRAINT community_topics_status_check 
CHECK (status = ANY (ARRAY['ATIVO'::text, 'OCULTO'::text, 'MODERADO'::text, 'DELETED'::text]));

ALTER TABLE public.community_comments 
ADD CONSTRAINT community_comments_status_check 
CHECK (status = ANY (ARRAY['ATIVO'::text, 'OCULTO'::text, 'MODERADO'::text, 'DELETED'::text]));

-- 3) Update the moderation functions to use correct status
CREATE OR REPLACE FUNCTION public.moderate_delete_topic(
  _topic_id UUID,
  _reason TEXT DEFAULT 'Removido pelo moderador'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _topic RECORD;
  _comment_count INT;
BEGIN
  -- Check permission
  IF NOT can_moderate_community(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para moderar';
  END IF;

  -- Get topic info
  SELECT * INTO _topic FROM community_topics WHERE id = _topic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tópico não encontrado';
  END IF;

  -- Soft delete the topic
  UPDATE community_topics SET
    status = 'DELETED',
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    delete_reason = _reason
  WHERE id = _topic_id;

  -- Soft delete all comments in the topic
  UPDATE community_comments SET
    status = 'DELETED',
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    delete_reason = 'Tópico removido'
  WHERE topic_id = _topic_id AND deleted_at IS NULL;

  GET DIAGNOSTICS _comment_count = ROW_COUNT;

  -- Log the action
  INSERT INTO moderation_logs (
    workspace_id,
    actor_user_id,
    action_type,
    target_type,
    target_id,
    reason,
    metadata
  ) VALUES (
    get_current_workspace(),
    auth.uid(),
    'DELETE_TOPIC',
    'topic',
    _topic_id,
    _reason,
    jsonb_build_object(
      'topic_title', _topic.titulo,
      'comments_deleted', _comment_count
    )
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_delete_comment(
  _comment_id UUID,
  _reason TEXT DEFAULT 'Removido pelo moderador'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _comment RECORD;
BEGIN
  -- Check permission
  IF NOT can_moderate_community(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para moderar';
  END IF;

  -- Get comment info
  SELECT * INTO _comment FROM community_comments WHERE id = _comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comentário não encontrado';
  END IF;

  -- Soft delete the comment
  UPDATE community_comments SET
    status = 'DELETED',
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    delete_reason = _reason
  WHERE id = _comment_id;

  -- Log the action
  INSERT INTO moderation_logs (
    workspace_id,
    actor_user_id,
    action_type,
    target_type,
    target_id,
    reason,
    metadata
  ) VALUES (
    get_current_workspace(),
    auth.uid(),
    'DELETE_COMMENT',
    'comment',
    _comment_id,
    _reason,
    jsonb_build_object(
      'topic_id', _comment.topic_id,
      'content_preview', LEFT(_comment.conteudo, 100)
    )
  );

  RETURN TRUE;
END;
$$;
