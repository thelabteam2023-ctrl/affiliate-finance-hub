-- Atualizar função para calcular rollover baseado em TODAS as apostas do bookmaker com bônus ativo
-- Não precisa mais do bonus_id na aposta - basta que a bookmaker tenha o bônus creditado
CREATE OR REPLACE FUNCTION public.calculate_bonus_rollover(p_bonus_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus RECORD;
  v_rollover_progress numeric := 0;
BEGIN
  -- Buscar dados do bônus
  SELECT 
    status,
    credited_at,
    min_odds,
    rollover_target_amount,
    bookmaker_id,
    project_id
  INTO v_bonus
  FROM public.project_bookmaker_link_bonuses
  WHERE id = p_bonus_id;
  
  -- Se bônus não existe ou não está creditado, retorna 0
  IF v_bonus IS NULL OR v_bonus.status != 'credited' THEN
    RETURN 0;
  END IF;
  
  -- Calcular soma das stakes de TODAS as apostas do bookmaker do bônus
  -- Independente de ter bonus_id vinculado ou qual estratégia
  SELECT COALESCE(SUM(
    CASE 
      WHEN a.stake_consolidado IS NOT NULL THEN a.stake_consolidado
      ELSE COALESCE(a.stake, 0) + COALESCE(a.stake_bonus, 0)
    END
  ), 0)
  INTO v_rollover_progress
  FROM public.apostas_unificada a
  WHERE a.bookmaker_id = v_bonus.bookmaker_id
    AND a.projeto_id = v_bonus.project_id
    AND a.status != 'CANCELADA'
    -- Apenas apostas após creditação do bônus
    AND (v_bonus.credited_at IS NULL OR a.data_aposta >= v_bonus.credited_at)
    -- Apenas apostas com odd >= min_odds (se min_odds definida)
    AND (v_bonus.min_odds IS NULL OR COALESCE(a.odd, a.odd_final, 0) >= v_bonus.min_odds);
  
  RETURN v_rollover_progress;
END;
$$;

-- Atualizar trigger para recalcular rollover quando apostas são modificadas
CREATE OR REPLACE FUNCTION public.update_bonus_rollover_on_bet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus_id uuid;
  v_new_progress numeric;
BEGIN
  -- Para cada bônus ativo do bookmaker afetado, recalcular rollover
  FOR v_bonus_id IN 
    SELECT id FROM public.project_bookmaker_link_bonuses 
    WHERE bookmaker_id = COALESCE(NEW.bookmaker_id, OLD.bookmaker_id)
      AND project_id = COALESCE(NEW.projeto_id, OLD.projeto_id)
      AND status = 'credited'
  LOOP
    v_new_progress := calculate_bonus_rollover(v_bonus_id);
    
    UPDATE public.project_bookmaker_link_bonuses
    SET rollover_progress = v_new_progress,
        updated_at = now()
    WHERE id = v_bonus_id;
  END LOOP;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recalcular rollover para todos os bônus creditados existentes
DO $$
DECLARE
  bonus_rec RECORD;
  new_progress numeric;
BEGIN
  FOR bonus_rec IN 
    SELECT id FROM public.project_bookmaker_link_bonuses WHERE status = 'credited'
  LOOP
    new_progress := calculate_bonus_rollover(bonus_rec.id);
    UPDATE public.project_bookmaker_link_bonuses 
    SET rollover_progress = new_progress, updated_at = now()
    WHERE id = bonus_rec.id;
  END LOOP;
END $$;