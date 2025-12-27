-- =============================================
-- SISTEMA DE RANKING DE INFLUÊNCIA DE USUÁRIOS
-- =============================================

-- 1. Tabela de eventos brutos (append-only)
CREATE TABLE public.user_influence_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_user_influence_events_created_at ON public.user_influence_events (created_at);
CREATE INDEX idx_user_influence_events_user_date ON public.user_influence_events (user_id, created_at);

-- 2. Tabela de métricas diárias agregadas
CREATE TABLE public.user_influence_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  topics_created INTEGER NOT NULL DEFAULT 0,
  comments_made INTEGER NOT NULL DEFAULT 0,
  chat_messages INTEGER NOT NULL DEFAULT 0,
  reviews_made INTEGER NOT NULL DEFAULT 0,
  total_interactions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id, metric_date)
);

CREATE INDEX idx_user_influence_daily_date ON public.user_influence_daily (metric_date);

-- 3. Tabela de rankings (snapshots imutáveis)
CREATE TABLE public.user_influence_ranking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly', 'yearly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  influence_score NUMERIC NOT NULL DEFAULT 0,
  topics_created INTEGER NOT NULL DEFAULT 0,
  comments_made INTEGER NOT NULL DEFAULT 0,
  chat_messages INTEGER NOT NULL DEFAULT 0,
  reviews_made INTEGER NOT NULL DEFAULT 0,
  total_interactions INTEGER NOT NULL DEFAULT 0,
  rank_position INTEGER NOT NULL,
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id, period_type, period_start)
);

CREATE INDEX idx_user_influence_ranking_period ON public.user_influence_ranking (period_type, period_start);

-- 4. Tabela de configuração de pesos
CREATE TABLE public.user_influence_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE DEFAULT 'global',
  weight_topic NUMERIC NOT NULL DEFAULT 5,
  weight_comment NUMERIC NOT NULL DEFAULT 2,
  weight_chat NUMERIC NOT NULL DEFAULT 1,
  weight_review NUMERIC NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inserir configuração padrão
INSERT INTO public.user_influence_config (config_key, weight_topic, weight_comment, weight_chat, weight_review)
VALUES ('global', 5, 2, 1, 10);

-- =============================================
-- RLS POLICIES (apenas System Owner)
-- =============================================

ALTER TABLE public.user_influence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_influence_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_influence_ranking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_influence_config ENABLE ROW LEVEL SECURITY;

-- user_influence_events
CREATE POLICY "System owner full access on events" ON public.user_influence_events
FOR ALL USING (public.is_system_owner(auth.uid()));

-- user_influence_daily
CREATE POLICY "System owner full access on daily" ON public.user_influence_daily
FOR ALL USING (public.is_system_owner(auth.uid()));

-- user_influence_ranking
CREATE POLICY "System owner full access on ranking" ON public.user_influence_ranking
FOR ALL USING (public.is_system_owner(auth.uid()));

-- user_influence_config
CREATE POLICY "System owner full access on config" ON public.user_influence_config
FOR ALL USING (public.is_system_owner(auth.uid()));

-- =============================================
-- TRIGGERS DE CAPTURA DE EVENTOS
-- =============================================

-- Função genérica para registrar eventos
CREATE OR REPLACE FUNCTION public.register_influence_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_event_type TEXT;
  v_entity_type TEXT;
  v_workspace_id UUID;
BEGIN
  -- Determinar tipo de evento baseado na tabela
  CASE TG_TABLE_NAME
    WHEN 'community_topics' THEN
      v_event_type := 'topic_created';
      v_entity_type := 'topic';
      -- Buscar workspace_id do usuário
      SELECT workspace_id INTO v_workspace_id
      FROM workspace_members
      WHERE user_id = NEW.user_id AND is_active = true
      LIMIT 1;
    WHEN 'community_comments' THEN
      v_event_type := 'topic_comment';
      v_entity_type := 'comment';
      SELECT workspace_id INTO v_workspace_id
      FROM workspace_members
      WHERE user_id = NEW.user_id AND is_active = true
      LIMIT 1;
    WHEN 'community_chat_messages' THEN
      v_event_type := 'chat_message';
      v_entity_type := 'message';
      v_workspace_id := NEW.workspace_id;
    WHEN 'community_evaluations' THEN
      v_event_type := 'house_review';
      v_entity_type := 'evaluation';
      SELECT workspace_id INTO v_workspace_id
      FROM workspace_members
      WHERE user_id = NEW.user_id AND is_active = true
      LIMIT 1;
  END CASE;

  -- Inserir evento apenas se temos workspace_id
  IF v_workspace_id IS NOT NULL THEN
    INSERT INTO public.user_influence_events (user_id, workspace_id, event_type, entity_type, entity_id)
    VALUES (NEW.user_id, v_workspace_id, v_event_type, v_entity_type, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger para community_topics
CREATE TRIGGER trigger_influence_topic_created
AFTER INSERT ON public.community_topics
FOR EACH ROW
EXECUTE FUNCTION public.register_influence_event();

-- Trigger para community_comments
CREATE TRIGGER trigger_influence_comment_created
AFTER INSERT ON public.community_comments
FOR EACH ROW
EXECUTE FUNCTION public.register_influence_event();

-- Trigger para community_chat_messages
CREATE TRIGGER trigger_influence_chat_message
AFTER INSERT ON public.community_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.register_influence_event();

-- Trigger para community_evaluations
CREATE TRIGGER trigger_influence_evaluation_created
AFTER INSERT ON public.community_evaluations
FOR EACH ROW
EXECUTE FUNCTION public.register_influence_event();

-- =============================================
-- FUNÇÕES DE AGREGAÇÃO E RANKING
-- =============================================

-- Função para agregar eventos do dia
CREATE OR REPLACE FUNCTION public.aggregate_daily_influence(target_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Inserir ou atualizar métricas diárias
  INSERT INTO user_influence_daily (user_id, workspace_id, metric_date, topics_created, comments_made, chat_messages, reviews_made, total_interactions)
  SELECT 
    e.user_id,
    e.workspace_id,
    target_date,
    COUNT(*) FILTER (WHERE e.event_type = 'topic_created'),
    COUNT(*) FILTER (WHERE e.event_type = 'topic_comment'),
    COUNT(*) FILTER (WHERE e.event_type = 'chat_message'),
    COUNT(*) FILTER (WHERE e.event_type = 'house_review'),
    COUNT(*)
  FROM user_influence_events e
  WHERE e.created_at >= target_date::TIMESTAMP WITH TIME ZONE
    AND e.created_at < (target_date + INTERVAL '1 day')::TIMESTAMP WITH TIME ZONE
  GROUP BY e.user_id, e.workspace_id
  ON CONFLICT (user_id, workspace_id, metric_date)
  DO UPDATE SET
    topics_created = EXCLUDED.topics_created,
    comments_made = EXCLUDED.comments_made,
    chat_messages = EXCLUDED.chat_messages,
    reviews_made = EXCLUDED.reviews_made,
    total_interactions = EXCLUDED.total_interactions;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Função para calcular ranking de um período
CREATE OR REPLACE FUNCTION public.calculate_influence_ranking(
  p_period_type TEXT,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER := 0;
  v_weight_topic NUMERIC;
  v_weight_comment NUMERIC;
  v_weight_chat NUMERIC;
  v_weight_review NUMERIC;
BEGIN
  -- Buscar pesos da configuração
  SELECT weight_topic, weight_comment, weight_chat, weight_review
  INTO v_weight_topic, v_weight_comment, v_weight_chat, v_weight_review
  FROM user_influence_config
  WHERE config_key = 'global' AND active = true
  LIMIT 1;
  
  -- Defaults caso não exista config
  v_weight_topic := COALESCE(v_weight_topic, 5);
  v_weight_comment := COALESCE(v_weight_comment, 2);
  v_weight_chat := COALESCE(v_weight_chat, 1);
  v_weight_review := COALESCE(v_weight_review, 10);

  -- Deletar ranking anterior do mesmo período (para permitir recálculo)
  DELETE FROM user_influence_ranking
  WHERE period_type = p_period_type AND period_start = p_period_start;

  -- Inserir novo ranking
  INSERT INTO user_influence_ranking (
    user_id, workspace_id, period_type, period_start, period_end,
    topics_created, comments_made, chat_messages, reviews_made,
    total_interactions, influence_score, rank_position
  )
  SELECT 
    d.user_id,
    d.workspace_id,
    p_period_type,
    p_period_start,
    p_period_end,
    SUM(d.topics_created)::INTEGER,
    SUM(d.comments_made)::INTEGER,
    SUM(d.chat_messages)::INTEGER,
    SUM(d.reviews_made)::INTEGER,
    SUM(d.total_interactions)::INTEGER,
    (SUM(d.topics_created) * v_weight_topic +
     SUM(d.comments_made) * v_weight_comment +
     SUM(d.chat_messages) * v_weight_chat +
     SUM(d.reviews_made) * v_weight_review)::NUMERIC,
    ROW_NUMBER() OVER (
      ORDER BY (SUM(d.topics_created) * v_weight_topic +
                SUM(d.comments_made) * v_weight_comment +
                SUM(d.chat_messages) * v_weight_chat +
                SUM(d.reviews_made) * v_weight_review) DESC
    )::INTEGER
  FROM user_influence_daily d
  WHERE d.metric_date >= p_period_start AND d.metric_date <= p_period_end
  GROUP BY d.user_id, d.workspace_id
  HAVING SUM(d.total_interactions) > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Função para obter configuração atual
CREATE OR REPLACE FUNCTION public.get_influence_config()
RETURNS TABLE(
  weight_topic NUMERIC,
  weight_comment NUMERIC,
  weight_chat NUMERIC,
  weight_review NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT weight_topic, weight_comment, weight_chat, weight_review
  FROM user_influence_config
  WHERE config_key = 'global' AND active = true
  LIMIT 1;
$$;

-- Função para atualizar configuração
CREATE OR REPLACE FUNCTION public.update_influence_config(
  p_weight_topic NUMERIC,
  p_weight_comment NUMERIC,
  p_weight_chat NUMERIC,
  p_weight_review NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Verificar se é system owner
  IF NOT public.is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  UPDATE user_influence_config
  SET 
    weight_topic = p_weight_topic,
    weight_comment = p_weight_comment,
    weight_chat = p_weight_chat,
    weight_review = p_weight_review,
    updated_at = now()
  WHERE config_key = 'global';

  RETURN FOUND;
END;
$$;