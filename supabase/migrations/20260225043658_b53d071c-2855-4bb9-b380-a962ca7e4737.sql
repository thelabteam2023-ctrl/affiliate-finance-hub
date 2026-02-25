
-- =============================================
-- 1. BLOCKED WORDS TABLE + VALIDATION
-- =============================================

CREATE TABLE public.community_blocked_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'geral',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.community_blocked_words ENABLE ROW LEVEL SECURITY;

-- Only moderators/admins can manage blocked words (via RPC)
CREATE POLICY "Blocked words readable by authenticated"
  ON public.community_blocked_words FOR SELECT
  TO authenticated USING (true);

-- Insert initial blocked words (Portuguese profanity, sexual, slurs)
INSERT INTO public.community_blocked_words (word, category) VALUES
  ('porra', 'palavrao'),
  ('caralho', 'palavrao'),
  ('puta', 'palavrao'),
  ('merda', 'palavrao'),
  ('foda', 'palavrao'),
  ('fodase', 'palavrao'),
  ('fdp', 'palavrao'),
  ('filho da puta', 'palavrao'),
  ('arrombado', 'palavrao'),
  ('desgraçado', 'palavrao'),
  ('cuzão', 'palavrao'),
  ('viado', 'pejorativo'),
  ('veado', 'pejorativo'),
  ('bicha', 'pejorativo'),
  ('sapatão', 'pejorativo'),
  ('traveco', 'pejorativo'),
  ('retardado', 'pejorativo'),
  ('mongolóide', 'pejorativo'),
  ('piranha', 'sexual'),
  ('vagabunda', 'sexual'),
  ('putaria', 'sexual'),
  ('pornografia', 'sexual'),
  ('sexo', 'sexual'),
  ('nudes', 'sexual'),
  ('gostosa', 'sexual'),
  ('buceta', 'sexual'),
  ('rola', 'sexual'),
  ('pau', 'sexual'),
  ('pinto', 'sexual');

-- Validation function that checks content against blocked words
CREATE OR REPLACE FUNCTION public.check_blocked_words(p_content text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_word text;
  lower_content text;
BEGIN
  lower_content := lower(p_content);
  
  SELECT word INTO found_word
  FROM public.community_blocked_words
  WHERE lower_content LIKE '%' || lower(word) || '%'
  LIMIT 1;
  
  RETURN found_word;
END;
$$;

-- Trigger function to validate topics
CREATE OR REPLACE FUNCTION public.validate_community_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blocked text;
  content_to_check text;
BEGIN
  -- Build content to check based on table
  IF TG_TABLE_NAME = 'community_topics' THEN
    content_to_check := COALESCE(NEW.titulo, '') || ' ' || COALESCE(NEW.conteudo, '');
  ELSIF TG_TABLE_NAME = 'community_comments' THEN
    content_to_check := COALESCE(NEW.conteudo, '');
  ELSIF TG_TABLE_NAME = 'community_chat_messages' THEN
    content_to_check := COALESCE(NEW.content, '');
  END IF;

  blocked := public.check_blocked_words(content_to_check);
  
  IF blocked IS NOT NULL THEN
    RAISE EXCEPTION 'Conteúdo contém termos não permitidos. Por favor, revise seu texto.'
      USING ERRCODE = 'P0001';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply triggers
CREATE TRIGGER trg_validate_topic_content
  BEFORE INSERT OR UPDATE ON public.community_topics
  FOR EACH ROW EXECUTE FUNCTION public.validate_community_content();

CREATE TRIGGER trg_validate_comment_content
  BEFORE INSERT OR UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.validate_community_content();

CREATE TRIGGER trg_validate_chat_content
  BEFORE INSERT OR UPDATE ON public.community_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_community_content();

-- =============================================
-- 2. CONTENT REPORTS TABLE
-- =============================================

CREATE TABLE public.community_content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id),
  content_type text NOT NULL CHECK (content_type IN ('topic', 'comment', 'chat_message')),
  content_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam', 'ofensivo', 'sexual', 'assedio', 'desinformacao', 'outro')),
  description text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'revisado', 'resolvido', 'descartado')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reporter_id, content_type, content_id)
);

ALTER TABLE public.community_content_reports ENABLE ROW LEVEL SECURITY;

-- Users can create reports
CREATE POLICY "Users can create reports"
  ON public.community_content_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- Users can see their own reports
CREATE POLICY "Users can view own reports"
  ON public.community_content_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- =============================================
-- 3. AUTHOR DELETE FUNCTION (soft delete)
-- =============================================

CREATE OR REPLACE FUNCTION public.author_delete_topic(p_topic_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_topic record;
BEGIN
  SELECT * INTO v_topic FROM community_topics WHERE id = p_topic_id;
  
  IF v_topic IS NULL THEN
    RAISE EXCEPTION 'Tópico não encontrado';
  END IF;
  
  IF v_topic.user_id != v_user_id THEN
    RAISE EXCEPTION 'Sem permissão para excluir este tópico';
  END IF;
  
  -- Soft delete
  UPDATE community_topics 
  SET status = 'REMOVIDO_AUTOR', updated_at = now()
  WHERE id = p_topic_id;
  
  -- Also soft delete comments
  UPDATE community_comments 
  SET status = 'REMOVIDO_AUTOR', updated_at = now()
  WHERE topic_id = p_topic_id AND status = 'ATIVO';
  
  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.author_delete_comment(p_comment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_comment record;
BEGIN
  SELECT * INTO v_comment FROM community_comments WHERE id = p_comment_id;
  
  IF v_comment IS NULL THEN
    RAISE EXCEPTION 'Comentário não encontrado';
  END IF;
  
  IF v_comment.user_id != v_user_id THEN
    RAISE EXCEPTION 'Sem permissão para excluir este comentário';
  END IF;
  
  UPDATE community_comments 
  SET status = 'REMOVIDO_AUTOR', updated_at = now()
  WHERE id = p_comment_id;
  
  RETURN json_build_object('success', true);
END;
$$;
