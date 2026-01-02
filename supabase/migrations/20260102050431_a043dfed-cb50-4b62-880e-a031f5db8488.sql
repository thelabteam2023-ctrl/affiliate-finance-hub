-- Criar validação para garantir apenas 1 bônus ativo (credited) por bookmaker por projeto
-- Se já existe um bônus credited, não permite criar outro até finalizar

CREATE OR REPLACE FUNCTION public.validate_single_active_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_bonus_id uuid;
  v_existing_bonus_title text;
BEGIN
  -- Só valida se status está sendo alterado para 'credited' ou é INSERT com credited
  IF NEW.status = 'credited' THEN
    -- Verificar se já existe outro bônus creditado para este bookmaker/projeto
    SELECT id, title INTO v_existing_bonus_id, v_existing_bonus_title
    FROM public.project_bookmaker_link_bonuses
    WHERE bookmaker_id = NEW.bookmaker_id
      AND project_id = NEW.project_id
      AND status = 'credited'
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;
    
    IF v_existing_bonus_id IS NOT NULL THEN
      RAISE EXCEPTION 'Já existe um bônus ativo (%) para esta casa. Finalize-o antes de creditar um novo.', v_existing_bonus_title
        USING ERRCODE = '23505';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Aplicar trigger
DROP TRIGGER IF EXISTS trg_validate_single_active_bonus ON public.project_bookmaker_link_bonuses;
CREATE TRIGGER trg_validate_single_active_bonus
  BEFORE INSERT OR UPDATE ON public.project_bookmaker_link_bonuses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_single_active_bonus();