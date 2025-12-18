-- Add edited_at column to community_topics
ALTER TABLE public.community_topics 
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add edited_at column to community_comments
ALTER TABLE public.community_comments 
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create helper function to check if user is owner/admin of their workspace
CREATE OR REPLACE FUNCTION public.user_is_owner_or_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.user_id = check_user_id
      AND wm.is_active = true
      AND wm.role IN ('owner', 'master', 'admin')
  )
$$;

-- Update RLS policy for community_topics UPDATE
DROP POLICY IF EXISTS "Users can update own topics" ON public.community_topics;
CREATE POLICY "Users can update own topics or admin" 
ON public.community_topics 
FOR UPDATE 
USING (
  (auth.uid() = user_id AND user_has_pro_access(auth.uid()))
  OR user_is_owner_or_admin(auth.uid())
);

-- Update RLS policy for community_comments UPDATE (already has one, need to update)
DROP POLICY IF EXISTS "Users can update own comments" ON public.community_comments;
CREATE POLICY "Users can update own comments or admin" 
ON public.community_comments 
FOR UPDATE 
USING (
  (auth.uid() = user_id AND user_has_pro_access(auth.uid()))
  OR user_is_owner_or_admin(auth.uid())
);