-- Add projeto_id column to planning_campanhas
ALTER TABLE public.planning_campanhas 
ADD COLUMN projeto_id UUID REFERENCES public.projetos(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_planning_campanhas_projeto_id ON public.planning_campanhas(projeto_id);

-- Link existing May 2026 campaigns to 'BÔNUS MAIO' project (aa37a6ee-5c29-40c6-b77a-a64df1dd0dbd)
UPDATE public.planning_campanhas
SET projeto_id = 'aa37a6ee-5c29-40c6-b77a-a64df1dd0dbd'
WHERE scheduled_date >= '2026-05-01' AND scheduled_date <= '2026-05-31';