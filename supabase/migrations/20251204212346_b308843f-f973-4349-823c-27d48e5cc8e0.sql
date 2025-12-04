-- Add projeto_id to bookmakers table to link partner-bookmaker accounts to projects
ALTER TABLE public.bookmakers 
ADD COLUMN projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX idx_bookmakers_projeto_id ON public.bookmakers(projeto_id);

-- Create a function to validate bookmaker exclusivity per project
CREATE OR REPLACE FUNCTION public.validate_bookmaker_projeto_exclusivo()
RETURNS TRIGGER AS $$
DECLARE
  v_projeto_status TEXT;
  v_existing_projeto_status TEXT;
BEGIN
  -- If projeto_id is being set
  IF NEW.projeto_id IS NOT NULL THEN
    -- Check if the target project is active
    SELECT status INTO v_projeto_status
    FROM public.projetos
    WHERE id = NEW.projeto_id;
    
    -- Check if bookmaker is already in another active project
    IF OLD.projeto_id IS NOT NULL AND OLD.projeto_id != NEW.projeto_id THEN
      SELECT p.status INTO v_existing_projeto_status
      FROM public.projetos p
      WHERE p.id = OLD.projeto_id;
      
      IF v_existing_projeto_status IN ('PLANEJADO', 'EM_ANDAMENTO') THEN
        RAISE EXCEPTION 'Este vínculo parceiro-bookmaker já está em uso no projeto atual. Libere-o primeiro.'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for validation
CREATE TRIGGER validate_bookmaker_projeto_exclusivo_trigger
BEFORE INSERT OR UPDATE ON public.bookmakers
FOR EACH ROW
EXECUTE FUNCTION public.validate_bookmaker_projeto_exclusivo();

-- Create view to show bookmaker availability status
CREATE OR REPLACE VIEW public.v_bookmaker_disponibilidade AS
SELECT 
  b.id,
  b.nome,
  b.parceiro_id,
  p.nome AS parceiro_nome,
  b.projeto_id,
  pr.nome AS projeto_nome,
  pr.status AS projeto_status,
  b.status AS bookmaker_status,
  b.saldo_atual,
  CASE 
    WHEN b.status = 'LIMITADA' THEN 'LIMITADA'
    WHEN b.projeto_id IS NULL THEN 'DISPONIVEL'
    WHEN pr.status IN ('PLANEJADO', 'EM_ANDAMENTO') THEN 'EM_USO'
    ELSE 'DISPONIVEL'
  END AS disponibilidade,
  b.user_id
FROM public.bookmakers b
LEFT JOIN public.parceiros p ON b.parceiro_id = p.id
LEFT JOIN public.projetos pr ON b.projeto_id = pr.id;

-- Add RLS policy for the view
ALTER VIEW public.v_bookmaker_disponibilidade SET (security_invoker = true);