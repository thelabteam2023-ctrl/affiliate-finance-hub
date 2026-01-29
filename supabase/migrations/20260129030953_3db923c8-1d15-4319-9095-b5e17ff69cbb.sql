-- Adicionar campo para ordenação manual dos projetos (Kanban)
ALTER TABLE public.projetos 
ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Criar índice para ordenação eficiente
CREATE INDEX IF NOT EXISTS idx_projetos_display_order 
ON public.projetos (workspace_id, display_order);

-- Inicializar ordem baseada na data de criação
UPDATE public.projetos 
SET display_order = subq.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at) as row_num
  FROM public.projetos
) subq
WHERE projetos.id = subq.id AND projetos.display_order = 0;