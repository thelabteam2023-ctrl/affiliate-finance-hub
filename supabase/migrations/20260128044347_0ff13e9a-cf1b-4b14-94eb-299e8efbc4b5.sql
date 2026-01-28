
-- FIX: O trigger atual só atualiza rollover se a aposta tiver bonus_id preenchido.
-- Mas a regra correta é: qualquer aposta liquidada da bookmaker com bônus ativo conta para rollover.
-- Solução: Buscar bônus ativo pelo bookmaker_id + projeto_id ao invés de bonus_id direto.

-- Atualizar função do trigger
CREATE OR REPLACE FUNCTION public.update_bonus_rollover_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bookmaker_id uuid;
  v_projeto_id uuid;
  v_bonus_record RECORD;
  v_new_progress numeric;
BEGIN
  -- Determinar bookmaker_id e projeto_id
  IF TG_OP = 'DELETE' THEN
    v_bookmaker_id := OLD.bookmaker_id;
    v_projeto_id := OLD.projeto_id;
  ELSE
    v_bookmaker_id := NEW.bookmaker_id;
    v_projeto_id := NEW.projeto_id;
  END IF;
  
  -- Se não há bookmaker_id, não fazer nada
  IF v_bookmaker_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  
  -- NOVA LÓGICA: Buscar TODOS os bônus ativos desta bookmaker no projeto
  -- e atualizar o rollover de cada um
  FOR v_bonus_record IN 
    SELECT id 
    FROM public.project_bookmaker_link_bonuses
    WHERE bookmaker_id = v_bookmaker_id
      AND project_id = v_projeto_id
      AND status = 'credited'
      AND rollover_target_amount IS NOT NULL
      AND rollover_target_amount > 0
  LOOP
    -- Calcular novo progresso
    v_new_progress := public.calculate_bonus_rollover(v_bonus_record.id);
    
    -- Atualizar o bônus
    UPDATE public.project_bookmaker_link_bonuses
    SET rollover_progress = v_new_progress,
        updated_at = now()
    WHERE id = v_bonus_record.id;
  END LOOP;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Recriar o trigger para garantir que está ativo
DROP TRIGGER IF EXISTS trg_update_bonus_rollover ON public.apostas_unificada;

CREATE TRIGGER trg_update_bonus_rollover
  AFTER INSERT OR UPDATE OR DELETE ON public.apostas_unificada
  FOR EACH ROW
  EXECUTE FUNCTION public.update_bonus_rollover_trigger();

COMMENT ON FUNCTION public.update_bonus_rollover_trigger() IS 
'Trigger que sincroniza automaticamente o progresso do rollover de bônus quando apostas são criadas, atualizadas ou excluídas. Usa bookmaker_id + projeto_id para encontrar bônus ativos ao invés de exigir bonus_id direto na aposta.';
