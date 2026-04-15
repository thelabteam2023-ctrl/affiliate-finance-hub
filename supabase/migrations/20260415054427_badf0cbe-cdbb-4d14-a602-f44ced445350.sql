
-- ============================================================================
-- TRIGGER: Auto-sync rollover when bets are liquidated
-- 
-- BUG: rollover_progress was never updated automatically after liquidation
-- of surebets (or simple bets). The calculate_bonus_rollover function existed
-- but was never called by any trigger.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_rollover_on_liquidation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bonus RECORD;
  v_new_progress numeric;
  v_bookmaker_ids uuid[];
BEGIN
  -- Only act when status changes TO 'LIQUIDADA'
  IF NEW.status = 'LIQUIDADA' AND (OLD.status IS DISTINCT FROM 'LIQUIDADA') THEN
    
    -- Collect all bookmaker_ids involved
    IF NEW.forma_registro = 'ARBITRAGEM' THEN
      -- For surebets: get all bookmaker_ids from pernas
      SELECT ARRAY_AGG(DISTINCT ap.bookmaker_id)
      INTO v_bookmaker_ids
      FROM public.apostas_pernas ap
      WHERE ap.aposta_id = NEW.id;
    ELSE
      -- For simple bets: just the single bookmaker
      IF NEW.bookmaker_id IS NOT NULL THEN
        v_bookmaker_ids := ARRAY[NEW.bookmaker_id];
      END IF;
    END IF;
    
    -- If no bookmakers found, nothing to do
    IF v_bookmaker_ids IS NULL OR array_length(v_bookmaker_ids, 1) IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Recalculate rollover for all active bonuses of these bookmakers
    FOR v_bonus IN
      SELECT id
      FROM public.project_bookmaker_link_bonuses
      WHERE bookmaker_id = ANY(v_bookmaker_ids)
        AND project_id = NEW.projeto_id
        AND status = 'credited'
        AND rollover_target_amount IS NOT NULL
        AND rollover_target_amount > 0
    LOOP
      v_new_progress := public.calculate_bonus_rollover(v_bonus.id);
      
      UPDATE public.project_bookmaker_link_bonuses
      SET rollover_progress = v_new_progress,
          updated_at = now()
      WHERE id = v_bonus.id;
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_sync_rollover_on_liquidation ON public.apostas_unificada;
CREATE TRIGGER trg_sync_rollover_on_liquidation
  AFTER UPDATE ON public.apostas_unificada
  FOR EACH ROW
  WHEN (NEW.status = 'LIQUIDADA' AND OLD.status IS DISTINCT FROM 'LIQUIDADA')
  EXECUTE FUNCTION public.fn_sync_rollover_on_liquidation();

COMMENT ON FUNCTION public.fn_sync_rollover_on_liquidation() IS 
'Trigger que recalcula automaticamente o rollover de bônus ativos quando uma aposta (simples ou arbitragem) é liquidada. Para surebets, atualiza o rollover de TODAS as casas envolvidas nas pernas.';
