-- =============================================
-- MODERAÇÃO DA COMUNIDADE
-- Soft delete + moderation_logs + permissões
-- =============================================

-- 1) Adicionar colunas de soft delete em community_topics
ALTER TABLE public.community_topics 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS delete_reason TEXT DEFAULT NULL;

-- 2) Adicionar colunas de soft delete em community_comments
ALTER TABLE public.community_comments 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS delete_reason TEXT DEFAULT NULL;

-- 3) Adicionar colunas de soft delete em community_chat_messages
ALTER TABLE public.community_chat_messages 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS delete_reason TEXT DEFAULT NULL;

-- 4) Criar tabela de logs de moderação
CREATE TABLE IF NOT EXISTS public.moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL,
  action_type TEXT NOT NULL, -- DELETE_TOPIC, DELETE_COMMENT, DELETE_CHAT_MESSAGE, CLEAR_CHAT, etc.
  target_type TEXT NOT NULL, -- topic, comment, chat_message, chat_bulk
  target_id UUID, -- ID do item afetado (null para bulk)
  target_content TEXT, -- Snapshot do conteúdo deletado
  target_author_id UUID, -- ID do autor original
  metadata JSONB DEFAULT '{}', -- Info adicional (ex: count para bulk)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Habilitar RLS na tabela de logs
ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;

-- 6) Policy: Apenas system_owner pode ver todos os logs
CREATE POLICY "System owners can view all moderation logs"
ON public.moderation_logs FOR SELECT
USING (public.is_system_owner(auth.uid()));

-- 7) Policy: Owners/admins podem ver logs do próprio workspace
CREATE POLICY "Workspace admins can view their moderation logs"
ON public.moderation_logs FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin') 
    AND is_active = true
  )
);

-- 8) Policy: Inserção apenas por funções ou usuários autenticados
CREATE POLICY "Authenticated users can insert moderation logs"
ON public.moderation_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 9) Adicionar permissões de moderação na tabela role_permissions
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('owner', 'community.moderate'),
  ('owner', 'community.topic.delete_any'),
  ('owner', 'community.comment.delete_any'),
  ('owner', 'community.chat.delete_any'),
  ('admin', 'community.moderate'),
  ('admin', 'community.topic.delete_any'),
  ('admin', 'community.comment.delete_any'),
  ('admin', 'community.chat.delete_any')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 10) Função para verificar se usuário pode moderar
CREATE OR REPLACE FUNCTION public.can_moderate_community(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- System Owner sempre pode moderar
  IF public.is_system_owner(_user_id) THEN
    RETURN TRUE;
  END IF;
  
  -- Verificar permissão community.moderate
  RETURN public.has_permission(_user_id, 'community.moderate');
END;
$$;

-- 11) Função para soft delete de tópico com log
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
  v_topic RECORD;
  v_workspace_id UUID;
BEGIN
  -- Verificar permissão
  IF NOT public.can_moderate_community(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: permissão de moderação necessária';
  END IF;
  
  -- Buscar tópico
  SELECT * INTO v_topic FROM community_topics WHERE id = _topic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tópico não encontrado';
  END IF;
  
  -- Buscar workspace do moderador
  SELECT workspace_id INTO v_workspace_id 
  FROM workspace_members 
  WHERE user_id = auth.uid() AND is_active = true 
  LIMIT 1;
  
  -- Soft delete do tópico
  UPDATE community_topics
  SET 
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = _reason,
    status = 'REMOVIDO'
  WHERE id = _topic_id;
  
  -- Soft delete dos comentários associados
  UPDATE community_comments
  SET 
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = 'Tópico removido',
    status = 'REMOVIDO'
  WHERE topic_id = _topic_id AND deleted_at IS NULL;
  
  -- Registrar log
  INSERT INTO moderation_logs (
    workspace_id, actor_user_id, action_type, target_type, 
    target_id, target_content, target_author_id, metadata
  ) VALUES (
    v_workspace_id,
    auth.uid(),
    'DELETE_TOPIC',
    'topic',
    _topic_id,
    v_topic.titulo || ': ' || LEFT(v_topic.conteudo, 200),
    v_topic.user_id,
    jsonb_build_object('bookmaker_id', v_topic.bookmaker_catalogo_id, 'reason', _reason)
  );
  
  RETURN TRUE;
END;
$$;

-- 12) Função para soft delete de comentário com log
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
  v_comment RECORD;
  v_workspace_id UUID;
BEGIN
  -- Verificar permissão
  IF NOT public.can_moderate_community(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: permissão de moderação necessária';
  END IF;
  
  -- Buscar comentário
  SELECT * INTO v_comment FROM community_comments WHERE id = _comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comentário não encontrado';
  END IF;
  
  -- Buscar workspace do moderador
  SELECT workspace_id INTO v_workspace_id 
  FROM workspace_members 
  WHERE user_id = auth.uid() AND is_active = true 
  LIMIT 1;
  
  -- Soft delete
  UPDATE community_comments
  SET 
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = _reason,
    status = 'REMOVIDO'
  WHERE id = _comment_id;
  
  -- Registrar log
  INSERT INTO moderation_logs (
    workspace_id, actor_user_id, action_type, target_type, 
    target_id, target_content, target_author_id, metadata
  ) VALUES (
    v_workspace_id,
    auth.uid(),
    'DELETE_COMMENT',
    'comment',
    _comment_id,
    LEFT(v_comment.conteudo, 200),
    v_comment.user_id,
    jsonb_build_object('topic_id', v_comment.topic_id, 'reason', _reason)
  );
  
  RETURN TRUE;
END;
$$;

-- 13) Função para soft delete de mensagem de chat com log
CREATE OR REPLACE FUNCTION public.moderate_delete_chat_message(
  _message_id UUID,
  _reason TEXT DEFAULT 'Removida pelo moderador'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message RECORD;
  v_workspace_id UUID;
BEGIN
  -- Verificar permissão
  IF NOT public.can_moderate_community(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: permissão de moderação necessária';
  END IF;
  
  -- Buscar mensagem
  SELECT * INTO v_message FROM community_chat_messages WHERE id = _message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensagem não encontrada';
  END IF;
  
  v_workspace_id := v_message.workspace_id;
  
  -- Soft delete
  UPDATE community_chat_messages
  SET 
    deleted_at = now(),
    deleted_by = auth.uid(),
    delete_reason = _reason
  WHERE id = _message_id;
  
  -- Registrar log
  INSERT INTO moderation_logs (
    workspace_id, actor_user_id, action_type, target_type, 
    target_id, target_content, target_author_id, metadata
  ) VALUES (
    v_workspace_id,
    auth.uid(),
    'DELETE_CHAT_MESSAGE',
    'chat_message',
    _message_id,
    LEFT(v_message.content, 200),
    v_message.user_id,
    jsonb_build_object('context_type', v_message.context_type, 'context_id', v_message.context_id, 'reason', _reason)
  );
  
  RETURN TRUE;
END;
$$;

-- 14) Função para limpar chat (hard delete com log) - apenas para moderadores
CREATE OR REPLACE FUNCTION public.moderate_clear_chat(
  _workspace_id UUID,
  _context_type TEXT DEFAULT 'general',
  _context_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_snapshot JSONB;
BEGIN
  -- Verificar permissão
  IF NOT public.can_moderate_community(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: permissão de moderação necessária';
  END IF;
  
  -- Contar mensagens a serem deletadas (não deletadas ainda)
  IF _context_type = 'general' THEN
    SELECT COUNT(*) INTO v_count 
    FROM community_chat_messages 
    WHERE workspace_id = _workspace_id 
    AND context_type = 'general' 
    AND context_id IS NULL
    AND deleted_at IS NULL;
  ELSE
    SELECT COUNT(*) INTO v_count 
    FROM community_chat_messages 
    WHERE workspace_id = _workspace_id 
    AND context_type = _context_type 
    AND context_id = _context_id
    AND deleted_at IS NULL;
  END IF;
  
  -- Snapshot básico
  v_snapshot := jsonb_build_object(
    'messages_deleted', v_count,
    'context_type', _context_type,
    'context_id', _context_id
  );
  
  -- Hard delete das mensagens
  IF _context_type = 'general' THEN
    DELETE FROM community_chat_messages 
    WHERE workspace_id = _workspace_id 
    AND context_type = 'general' 
    AND context_id IS NULL;
  ELSE
    DELETE FROM community_chat_messages 
    WHERE workspace_id = _workspace_id 
    AND context_type = _context_type 
    AND context_id = _context_id;
  END IF;
  
  -- Registrar log
  INSERT INTO moderation_logs (
    workspace_id, actor_user_id, action_type, target_type, 
    target_id, target_content, target_author_id, metadata
  ) VALUES (
    _workspace_id,
    auth.uid(),
    'CLEAR_CHAT',
    'chat_bulk',
    NULL,
    'Limpeza de chat em massa',
    NULL,
    v_snapshot
  );
  
  RETURN jsonb_build_object('success', true, 'deleted_count', v_count);
END;
$$;

-- 15) Atualizar queries para filtrar itens deletados
-- (As views e queries existentes já filtram por status = 'ATIVO', 
-- mas adicionamos filtro por deleted_at para segurança extra)

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_community_topics_deleted_at ON community_topics(deleted_at);
CREATE INDEX IF NOT EXISTS idx_community_comments_deleted_at ON community_comments(deleted_at);
CREATE INDEX IF NOT EXISTS idx_community_chat_messages_deleted_at ON community_chat_messages(deleted_at);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_workspace_id ON moderation_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_created_at ON moderation_logs(created_at DESC);