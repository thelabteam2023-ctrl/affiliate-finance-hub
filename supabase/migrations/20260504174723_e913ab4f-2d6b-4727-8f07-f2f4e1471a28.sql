-- Add optional projeto link to distribuicao_planos
ALTER TABLE public.distribuicao_planos
  ADD COLUMN IF NOT EXISTS projeto_id uuid NULL
    REFERENCES public.projetos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_distribuicao_planos_projeto
  ON public.distribuicao_planos(projeto_id)
  WHERE projeto_id IS NOT NULL;

-- Trigger: garantir que projeto_id pertence ao mesmo workspace
CREATE OR REPLACE FUNCTION public.fn_check_distribuicao_plano_projeto_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proj_ws uuid;
BEGIN
  IF NEW.projeto_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT workspace_id INTO v_proj_ws
    FROM public.projetos
    WHERE id = NEW.projeto_id;
  IF v_proj_ws IS NULL THEN
    RAISE EXCEPTION 'Projeto vinculado não encontrado';
  END IF;
  IF v_proj_ws <> NEW.workspace_id THEN
    RAISE EXCEPTION 'Projeto vinculado pertence a outro workspace';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_distribuicao_planos_projeto_ws ON public.distribuicao_planos;
CREATE TRIGGER trg_distribuicao_planos_projeto_ws
  BEFORE INSERT OR UPDATE OF projeto_id, workspace_id ON public.distribuicao_planos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_check_distribuicao_plano_projeto_workspace();