-- 1. Adicionar coluna de nível de moderação à tabela de workspaces
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS chat_moderation_level TEXT DEFAULT 'strict' 
CHECK (chat_moderation_level IN ('strict', 'moderate', 'relaxed'));

-- 2. Atualizar a tabela de palavras bloqueadas com severidade
ALTER TABLE public.community_blocked_words 
ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'high' 
CHECK (severity IN ('low', 'medium', 'high', 'critical'));

-- 3. Criar tabela de logs de moderação
CREATE TABLE IF NOT EXISTS public.community_moderation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id),
    user_id UUID REFERENCES auth.users(id),
    content TEXT,
    blocked_word TEXT,
    context_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS para logs
ALTER TABLE public.community_moderation_logs ENABLE ROW LEVEL SECURITY;

-- Nota: Ajustado para usar is_system_owner() em vez de user_is_system_owner()
CREATE POLICY "Admins can view moderation logs" 
ON public.community_moderation_logs 
FOR SELECT 
USING (user_is_owner_or_admin_in_workspace(auth.uid(), workspace_id) OR is_system_owner(auth.uid()));

-- 4. Atualizar a função de verificação de palavras para suportar severidade
CREATE OR REPLACE FUNCTION public.check_blocked_words(p_content text, p_max_severity text DEFAULT 'low')
 RETURNS TABLE(word text, severity text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT cbw.word, cbw.severity
    FROM public.community_blocked_words cbw
    WHERE lower(p_content) LIKE '%' || lower(cbw.word) || '%'
    AND (
        (p_max_severity = 'strict' AND cbw.severity IN ('low', 'medium', 'high', 'critical')) OR
        (p_max_severity = 'moderate' AND cbw.severity IN ('medium', 'high', 'critical')) OR
        (p_max_severity = 'relaxed' AND cbw.severity IN ('high', 'critical'))
    )
    LIMIT 1;
END;
$function$;

-- 5. Atualizar a função de validação principal
CREATE OR REPLACE FUNCTION public.validate_community_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_found_word text;
  v_found_severity text;
  v_content_to_check text;
  v_mod_level text := 'strict'; -- Default level
  v_workspace_id uuid;
BEGIN
  -- Identificar o workspace e o conteúdo
  IF TG_TABLE_NAME = 'community_topics' THEN
    v_content_to_check := COALESCE(NEW.titulo, '') || ' ' || COALESCE(NEW.conteudo, '');
  ELSIF TG_TABLE_NAME = 'community_comments' THEN
    v_content_to_check := COALESCE(NEW.conteudo, '');
  ELSIF TG_TABLE_NAME = 'community_chat_messages' THEN
    v_content_to_check := COALESCE(NEW.content, '');
    v_workspace_id := NEW.workspace_id;
    
    -- Buscar nível de moderação do workspace
    SELECT chat_moderation_level INTO v_mod_level 
    FROM public.workspaces 
    WHERE id = v_workspace_id;
    
    v_mod_level := COALESCE(v_mod_level, 'strict');
  END IF;

  SELECT word, severity INTO v_found_word, v_found_severity
  FROM public.check_blocked_words(v_content_to_check, v_mod_level);
  
  IF v_found_word IS NOT NULL THEN
    -- Logar a tentativa de envio
    INSERT INTO public.community_moderation_logs (workspace_id, user_id, content, blocked_word, context_type)
    VALUES (v_workspace_id, auth.uid(), v_content_to_check, v_found_word, TG_TABLE_NAME);

    RAISE EXCEPTION 'Conteúdo contém termos não permitidos. Por favor, revise seu texto.'
      USING ERRCODE = 'P0001';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 6. Categorizar algumas palavras existentes como 'low' (palavrões comuns) para teste
UPDATE public.community_blocked_words 
SET severity = 'low' 
WHERE word IN ('porra', 'caralho', 'merda', 'foda', 'puta');

-- Manter ofensas e ódio como 'high' ou 'critical'
UPDATE public.community_blocked_words 
SET severity = 'high' 
WHERE word IN ('viado', 'veado', 'bicha', 'sapatão', 'traveco', 'retardado', 'mongolóide', 'fdp', 'filho da puta');
