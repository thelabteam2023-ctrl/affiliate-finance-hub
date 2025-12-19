-- Create table for project bookmaker link bonuses
CREATE TABLE public.project_bookmaker_link_bonuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  bonus_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'credited', 'failed', 'expired', 'reversed')),
  credited_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL
);

-- Create index for faster queries
CREATE INDEX idx_project_bookmaker_link_bonuses_project ON public.project_bookmaker_link_bonuses(project_id);
CREATE INDEX idx_project_bookmaker_link_bonuses_bookmaker ON public.project_bookmaker_link_bonuses(bookmaker_id);
CREATE INDEX idx_project_bookmaker_link_bonuses_status ON public.project_bookmaker_link_bonuses(status);
CREATE INDEX idx_project_bookmaker_link_bonuses_workspace ON public.project_bookmaker_link_bonuses(workspace_id);

-- Enable RLS
ALTER TABLE public.project_bookmaker_link_bonuses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Workspace isolation project_bookmaker_link_bonuses SELECT"
ON public.project_bookmaker_link_bonuses
FOR SELECT
USING ((workspace_id = get_current_workspace()) OR ((workspace_id IS NULL) AND (user_id = auth.uid())));

CREATE POLICY "Workspace isolation project_bookmaker_link_bonuses INSERT"
ON public.project_bookmaker_link_bonuses
FOR INSERT
WITH CHECK ((workspace_id = get_current_workspace()) AND (user_id = auth.uid()));

CREATE POLICY "Workspace isolation project_bookmaker_link_bonuses UPDATE"
ON public.project_bookmaker_link_bonuses
FOR UPDATE
USING ((workspace_id = get_current_workspace()) OR ((workspace_id IS NULL) AND (user_id = auth.uid())));

CREATE POLICY "Workspace isolation project_bookmaker_link_bonuses DELETE"
ON public.project_bookmaker_link_bonuses
FOR DELETE
USING ((workspace_id = get_current_workspace()) OR ((workspace_id IS NULL) AND (user_id = auth.uid())));

-- Trigger for updated_at
CREATE TRIGGER update_project_bookmaker_link_bonuses_updated_at
BEFORE UPDATE ON public.project_bookmaker_link_bonuses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();