-- Create table for project favorites
CREATE TABLE public.project_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_project_favorite UNIQUE (workspace_id, project_id, user_id)
);

-- Enable RLS
ALTER TABLE public.project_favorites ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own favorites in workspace"
ON public.project_favorites
FOR SELECT
USING (
  user_id = auth.uid() 
  AND workspace_id = get_current_workspace()
);

CREATE POLICY "Users can insert own favorites in workspace"
ON public.project_favorites
FOR INSERT
WITH CHECK (
  user_id = auth.uid() 
  AND workspace_id = get_current_workspace()
);

CREATE POLICY "Users can delete own favorites"
ON public.project_favorites
FOR DELETE
USING (
  user_id = auth.uid() 
  AND workspace_id = get_current_workspace()
);

-- Index for faster queries
CREATE INDEX idx_project_favorites_lookup 
ON public.project_favorites(workspace_id, user_id, project_id);