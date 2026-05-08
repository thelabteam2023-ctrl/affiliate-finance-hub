-- Create table for planning extras
CREATE TABLE public.planning_extras (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    projeto_id UUID REFERENCES public.projetos(id) ON DELETE SET NULL,
    parceiro_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
    bookmaker_catalogo_id UUID REFERENCES public.bookmakers_catalogo(id) ON DELETE SET NULL,
    bookmaker_nome TEXT NOT NULL,
    deposit_amount NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'BRL',
    status TEXT NOT NULL DEFAULT 'pending', -- pending, done
    notes TEXT,
    scheduled_date DATE, -- Optional: if set, affects temporal goal
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.planning_extras ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view planning extras of their workspace"
ON public.planning_extras
FOR SELECT
USING (
    workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert planning extras in their workspace"
ON public.planning_extras
FOR INSERT
WITH CHECK (
    workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update planning extras in their workspace"
ON public.planning_extras
FOR UPDATE
USING (
    workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete planning extras in their workspace"
ON public.planning_extras
FOR DELETE
USING (
    workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
);

-- Trigger for updated_at
CREATE TRIGGER update_planning_extras_updated_at
BEFORE UPDATE ON public.planning_extras
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_planning_extras_workspace ON public.planning_extras(workspace_id);
CREATE INDEX idx_planning_extras_projeto ON public.planning_extras(projeto_id);
CREATE INDEX idx_planning_extras_date ON public.planning_extras(scheduled_date);
