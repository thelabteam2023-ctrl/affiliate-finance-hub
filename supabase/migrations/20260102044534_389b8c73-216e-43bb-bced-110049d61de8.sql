-- Adicionar campo bonus_id na tabela apostas_unificada para vincular apostas a bônus
ALTER TABLE public.apostas_unificada
ADD COLUMN bonus_id uuid REFERENCES public.project_bookmaker_link_bonuses(id) ON DELETE SET NULL;

-- Criar índice para performance
CREATE INDEX idx_apostas_unificada_bonus_id ON public.apostas_unificada(bonus_id);

-- Criar função para calcular o rollover automaticamente
-- Considera: status = CREDITADO, data_aposta >= credited_at, odd >= min_odds
CREATE OR REPLACE FUNCTION public.calculate_bonus_rollover(p_bonus_id uuid)
RETURNS numeric AS $$
DECLARE
  v_bonus RECORD;
  v_rollover_progress numeric := 0;
BEGIN
  -- Buscar dados do bônus
  SELECT 
    status,
    credited_at,
    min_odds,
    rollover_target_amount
  INTO v_bonus
  FROM public.project_bookmaker_link_bonuses
  WHERE id = p_bonus_id;
  
  -- Se bônus não existe ou não está creditado, retorna 0
  IF v_bonus IS NULL OR v_bonus.status != 'credited' THEN
    RETURN 0;
  END IF;
  
  -- Calcular soma das stakes das apostas elegíveis
  SELECT COALESCE(SUM(
    CASE 
      WHEN a.stake_consolidado IS NOT NULL THEN a.stake_consolidado
      ELSE COALESCE(a.stake, 0) + COALESCE(a.stake_bonus, 0)
    END
  ), 0)
  INTO v_rollover_progress
  FROM public.apostas_unificada a
  WHERE a.bonus_id = p_bonus_id
    AND a.status != 'CANCELADA'
    -- Apenas apostas após creditação do bônus
    AND (v_bonus.credited_at IS NULL OR a.data_aposta >= v_bonus.credited_at)
    -- Apenas apostas com odd >= min_odds (se min_odds definida)
    AND (v_bonus.min_odds IS NULL OR COALESCE(a.odd, a.odd_final, 0) >= v_bonus.min_odds);
  
  RETURN v_rollover_progress;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger para atualizar rollover_progress automaticamente quando apostas são inseridas/atualizadas/deletadas
CREATE OR REPLACE FUNCTION public.update_bonus_rollover_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_bonus_id uuid;
  v_new_progress numeric;
BEGIN
  -- Determinar qual bonus_id usar
  IF TG_OP = 'DELETE' THEN
    v_bonus_id := OLD.bonus_id;
  ELSE
    v_bonus_id := NEW.bonus_id;
  END IF;
  
  -- Se não há bonus_id, não fazer nada
  IF v_bonus_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  
  -- Calcular novo progresso
  v_new_progress := public.calculate_bonus_rollover(v_bonus_id);
  
  -- Atualizar o bônus
  UPDATE public.project_bookmaker_link_bonuses
  SET rollover_progress = v_new_progress,
      updated_at = now()
  WHERE id = v_bonus_id;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger
DROP TRIGGER IF EXISTS trg_update_bonus_rollover ON public.apostas_unificada;
CREATE TRIGGER trg_update_bonus_rollover
AFTER INSERT OR UPDATE OR DELETE ON public.apostas_unificada
FOR EACH ROW
EXECUTE FUNCTION public.update_bonus_rollover_trigger();

-- Também criar trigger quando o status do bônus muda para recalcular
CREATE OR REPLACE FUNCTION public.recalculate_rollover_on_bonus_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalcular quando status muda para credited ou credited_at é definido
  IF (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'credited')
     OR (OLD.credited_at IS DISTINCT FROM NEW.credited_at)
     OR (OLD.min_odds IS DISTINCT FROM NEW.min_odds) THEN
    NEW.rollover_progress := public.calculate_bonus_rollover(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recalculate_rollover_on_bonus_change ON public.project_bookmaker_link_bonuses;
CREATE TRIGGER trg_recalculate_rollover_on_bonus_change
BEFORE UPDATE ON public.project_bookmaker_link_bonuses
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_rollover_on_bonus_change();