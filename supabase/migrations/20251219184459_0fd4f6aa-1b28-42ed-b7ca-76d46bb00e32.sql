-- ============================================
-- PARTE 2: CORRIGIR POLICIES EXISTENTES (COM DROP IF EXISTS MAIS PRECISO)
-- ============================================

-- COMMUNITY_TOPICS: Update - Dropar todas variantes e recriar
DROP POLICY IF EXISTS "Users can update own topics or admin" ON community_topics;
DROP POLICY IF EXISTS "Authors can update own topics" ON community_topics;
CREATE POLICY "Authors or admins can update topics"
ON community_topics FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() 
  OR public.user_is_owner_or_admin(auth.uid())
)
WITH CHECK (
  user_id = auth.uid() 
  OR public.user_is_owner_or_admin(auth.uid())
);

-- COMMUNITY_COMMENTS: Update - Dropar todas variantes e recriar
DROP POLICY IF EXISTS "Users can update own comments or admin" ON community_comments;
DROP POLICY IF EXISTS "Authors can update own comments" ON community_comments;
CREATE POLICY "Authors or admins can update comments"
ON community_comments FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() 
  OR public.user_is_owner_or_admin(auth.uid())
)
WITH CHECK (
  user_id = auth.uid() 
  OR public.user_is_owner_or_admin(auth.uid())
);

-- COMMUNITY_EVALUATIONS: Update - Dropar todas variantes e recriar
DROP POLICY IF EXISTS "Users can update own evaluations" ON community_evaluations;
DROP POLICY IF EXISTS "Authors can update own evaluations" ON community_evaluations;
CREATE POLICY "Authors can update evaluations"
ON community_evaluations FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- COMMUNITY_CHAT_MESSAGES: Update - Dropar todas variantes e recriar
DROP POLICY IF EXISTS "Users can update own messages or admin" ON community_chat_messages;
DROP POLICY IF EXISTS "Authors can update own messages" ON community_chat_messages;
CREATE POLICY "Authors or admins can update messages"
ON community_chat_messages FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() 
  OR public.user_is_owner_or_admin(auth.uid())
)
WITH CHECK (
  user_id = auth.uid() 
  OR public.user_is_owner_or_admin(auth.uid())
);