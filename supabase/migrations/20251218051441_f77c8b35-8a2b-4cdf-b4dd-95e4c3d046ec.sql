-- =============================================
-- MÓDULO COMUNIDADE - Avaliações e Discussões de Bookmakers
-- =============================================

-- Tabela de Avaliações de Bookmakers
CREATE TABLE public.community_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bookmaker_catalogo_id UUID NOT NULL REFERENCES public.bookmakers_catalogo(id) ON DELETE CASCADE,
  
  -- Critérios de avaliação (1-5)
  velocidade_pagamento INTEGER CHECK (velocidade_pagamento BETWEEN 1 AND 5),
  facilidade_verificacao INTEGER CHECK (facilidade_verificacao BETWEEN 1 AND 5),
  estabilidade_conta INTEGER CHECK (estabilidade_conta BETWEEN 1 AND 5),
  qualidade_suporte INTEGER CHECK (qualidade_suporte BETWEEN 1 AND 5),
  confiabilidade_geral INTEGER CHECK (confiabilidade_geral BETWEEN 1 AND 5),
  
  -- Nota média calculada
  nota_media NUMERIC(2,1) GENERATED ALWAYS AS (
    (COALESCE(velocidade_pagamento, 0) + COALESCE(facilidade_verificacao, 0) + 
     COALESCE(estabilidade_conta, 0) + COALESCE(qualidade_suporte, 0) + 
     COALESCE(confiabilidade_geral, 0)) / 5.0
  ) STORED,
  
  -- Status de bloqueio (categórico, não estrelas)
  status_bloqueio TEXT DEFAULT 'NAO_INFORMADO' CHECK (status_bloqueio IN ('NAO_INFORMADO', 'NUNCA_BLOQUEOU', 'BLOQUEOU_APOS_GANHOS', 'BLOQUEIO_RECORRENTE')),
  
  -- Anonimato opcional
  is_anonymous BOOLEAN DEFAULT false,
  
  -- Comentário opcional
  comentario TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Uma avaliação por usuário por casa
  CONSTRAINT unique_user_bookmaker_evaluation UNIQUE (user_id, bookmaker_catalogo_id)
);

-- Tabela de Tópicos/Discussões
CREATE TABLE public.community_topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bookmaker_catalogo_id UUID NOT NULL REFERENCES public.bookmakers_catalogo(id) ON DELETE CASCADE,
  
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  
  is_anonymous BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'OCULTO', 'MODERADO')),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de Comentários em Tópicos
CREATE TABLE public.community_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.community_topics(id) ON DELETE CASCADE,
  
  conteudo TEXT NOT NULL,
  
  is_anonymous BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'OCULTO', 'MODERADO')),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de Denúncias para Moderação
CREATE TABLE public.community_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  topic_id UUID REFERENCES public.community_topics(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  evaluation_id UUID REFERENCES public.community_evaluations(id) ON DELETE CASCADE,
  
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'ANALISADO', 'RESOLVIDO')),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Pelo menos um item deve ser denunciado
  CONSTRAINT at_least_one_target CHECK (
    (topic_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int + (evaluation_id IS NOT NULL)::int = 1
  )
);

-- =============================================
-- ÍNDICES
-- =============================================
CREATE INDEX idx_community_evaluations_bookmaker ON public.community_evaluations(bookmaker_catalogo_id);
CREATE INDEX idx_community_evaluations_user ON public.community_evaluations(user_id);
CREATE INDEX idx_community_topics_bookmaker ON public.community_topics(bookmaker_catalogo_id);
CREATE INDEX idx_community_topics_status ON public.community_topics(status);
CREATE INDEX idx_community_comments_topic ON public.community_comments(topic_id);
CREATE INDEX idx_community_reports_status ON public.community_reports(status);

-- =============================================
-- FUNÇÃO PARA VERIFICAR SE USUÁRIO TEM PLANO PRO+
-- =============================================
CREATE OR REPLACE FUNCTION public.user_has_pro_access(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_workspace_id UUID;
  v_plan TEXT;
BEGIN
  -- Buscar workspace do usuário
  SELECT workspace_id INTO v_workspace_id
  FROM workspace_members
  WHERE user_id = _user_id AND is_active = true
  LIMIT 1;
  
  IF v_workspace_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Buscar plano do workspace
  SELECT plan INTO v_plan
  FROM workspaces
  WHERE id = v_workspace_id;
  
  -- PRO e Advanced têm acesso
  RETURN v_plan IN ('pro', 'advanced');
END;
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- EVALUATIONS
ALTER TABLE public.community_evaluations ENABLE ROW LEVEL SECURITY;

-- Leitura: todos autenticados podem ver avaliações
CREATE POLICY "Anyone can read evaluations"
ON public.community_evaluations FOR SELECT
TO authenticated
USING (true);

-- Criação: apenas PRO+
CREATE POLICY "PRO+ can create evaluations"
ON public.community_evaluations FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  AND public.user_has_pro_access(auth.uid())
);

-- Edição: apenas próprio usuário PRO+
CREATE POLICY "Users can update own evaluations"
ON public.community_evaluations FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id 
  AND public.user_has_pro_access(auth.uid())
);

-- Sem delete (avaliações não podem ser apagadas)

-- TOPICS
ALTER TABLE public.community_topics ENABLE ROW LEVEL SECURITY;

-- Leitura: todos autenticados podem ver tópicos ativos
CREATE POLICY "Anyone can read active topics"
ON public.community_topics FOR SELECT
TO authenticated
USING (status = 'ATIVO' OR auth.uid() = user_id);

-- Criação: apenas PRO+
CREATE POLICY "PRO+ can create topics"
ON public.community_topics FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  AND public.user_has_pro_access(auth.uid())
);

-- Edição: apenas próprio usuário PRO+
CREATE POLICY "Users can update own topics"
ON public.community_topics FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id 
  AND public.user_has_pro_access(auth.uid())
);

-- COMMENTS
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

-- Leitura: todos autenticados podem ver comentários ativos
CREATE POLICY "Anyone can read active comments"
ON public.community_comments FOR SELECT
TO authenticated
USING (status = 'ATIVO' OR auth.uid() = user_id);

-- Criação: apenas PRO+
CREATE POLICY "PRO+ can create comments"
ON public.community_comments FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  AND public.user_has_pro_access(auth.uid())
);

-- Edição: apenas próprio usuário PRO+
CREATE POLICY "Users can update own comments"
ON public.community_comments FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id 
  AND public.user_has_pro_access(auth.uid())
);

-- REPORTS
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

-- Criação: qualquer autenticado pode denunciar
CREATE POLICY "Anyone can create reports"
ON public.community_reports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reporter_user_id);

-- Leitura: apenas owner/admin do workspace
CREATE POLICY "Only admins can read reports"
ON public.community_reports FOR SELECT
TO authenticated
USING (public.is_owner_or_admin(auth.uid()));

-- =============================================
-- VIEW AGREGADA DE BOOKMAKERS COM ESTATÍSTICAS
-- =============================================
CREATE OR REPLACE VIEW public.v_community_bookmaker_stats AS
SELECT 
  bc.id as bookmaker_catalogo_id,
  bc.nome,
  bc.logo_url,
  bc.status as regulamentacao_status,
  bc.visibility,
  
  -- Estatísticas de avaliações
  COUNT(DISTINCT ce.id) as total_avaliacoes,
  ROUND(AVG(ce.nota_media)::numeric, 1) as nota_media_geral,
  ROUND(AVG(ce.velocidade_pagamento)::numeric, 1) as media_velocidade_pagamento,
  ROUND(AVG(ce.facilidade_verificacao)::numeric, 1) as media_facilidade_verificacao,
  ROUND(AVG(ce.estabilidade_conta)::numeric, 1) as media_estabilidade_conta,
  ROUND(AVG(ce.qualidade_suporte)::numeric, 1) as media_qualidade_suporte,
  ROUND(AVG(ce.confiabilidade_geral)::numeric, 1) as media_confiabilidade_geral,
  
  -- Contagem de status de bloqueio
  COUNT(ce.id) FILTER (WHERE ce.status_bloqueio = 'BLOQUEOU_APOS_GANHOS') as bloqueios_apos_ganhos,
  COUNT(ce.id) FILTER (WHERE ce.status_bloqueio = 'BLOQUEIO_RECORRENTE') as bloqueios_recorrentes,
  
  -- Estatísticas de tópicos
  COUNT(DISTINCT ct.id) FILTER (WHERE ct.status = 'ATIVO') as total_topicos,
  MAX(ct.created_at) FILTER (WHERE ct.status = 'ATIVO') as ultimo_topico_data
  
FROM public.bookmakers_catalogo bc
LEFT JOIN public.community_evaluations ce ON ce.bookmaker_catalogo_id = bc.id
LEFT JOIN public.community_topics ct ON ct.bookmaker_catalogo_id = bc.id
WHERE bc.visibility IN ('GLOBAL_REGULATED', 'GLOBAL_RESTRICTED')
GROUP BY bc.id, bc.nome, bc.logo_url, bc.status, bc.visibility;

-- Triggers para updated_at
CREATE TRIGGER update_community_evaluations_updated_at
BEFORE UPDATE ON public.community_evaluations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_community_topics_updated_at
BEFORE UPDATE ON public.community_topics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_community_comments_updated_at
BEFORE UPDATE ON public.community_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();