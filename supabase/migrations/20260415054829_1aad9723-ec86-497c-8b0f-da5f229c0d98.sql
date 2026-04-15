
-- ============================================================================
-- EXPAND: Rollover auto-sync triggers for ALL mutation scenarios
-- ============================================================================

-- 1. Expand the apostas_unificada trigger to also cover DELETE and re-liquidation
DROP TRIGGER IF EXISTS trg_sync_rollover_on_liquidation ON public.apostas_unificada;

CREATE OR REPLACE FUNCTION public.fn_sync_rollover_on_bet_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bonus RECORD;
  v_new_progress numeric;
  v_bookmaker_ids uuid[];
  v_projeto_id uuid;
  v_relevant_record RECORD;
BEGIN
  -- Determine which record to use
  IF TG_OP = 'DELETE' THEN
    v_relevant_record := OLD;
  ELSE
    v_relevant_record := NEW;
  END IF;

  v_projeto_id := v_relevant_record.projeto_id;

  -- Determine if we should act:
  -- INSERT: only if already LIQUIDADA (rare but possible via import)
  -- UPDATE: status changed to/from LIQUIDADA, or stake/odd changed while LIQUIDADA
  -- DELETE: was LIQUIDADA
  IF TG_OP = 'INSERT' AND NEW.status != 'LIQUIDADA' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Only act if: status changed involving LIQUIDADA, or stake/odd changed while LIQUIDADA
    IF NOT (
      (NEW.status = 'LIQUIDADA' OR OLD.status = 'LIQUIDADA') AND
      (OLD.status IS DISTINCT FROM NEW.status
       OR OLD.stake IS DISTINCT FROM NEW.stake
       OR OLD.odd IS DISTINCT FROM NEW.odd
       OR OLD.odd_final IS DISTINCT FROM NEW.odd_final
       OR OLD.cancelled_at IS DISTINCT FROM NEW.cancelled_at
       OR OLD.resultado IS DISTINCT FROM NEW.resultado)
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status != 'LIQUIDADA' THEN
    RETURN OLD;
  END IF;

  -- Collect bookmaker_ids
  IF v_relevant_record.forma_registro = 'ARBITRAGEM' THEN
    SELECT ARRAY_AGG(DISTINCT ap.bookmaker_id)
    INTO v_bookmaker_ids
    FROM public.apostas_pernas ap
    WHERE ap.aposta_id = v_relevant_record.id;
  ELSE
    IF v_relevant_record.bookmaker_id IS NOT NULL THEN
      v_bookmaker_ids := ARRAY[v_relevant_record.bookmaker_id];
    END IF;
  END IF;

  IF v_bookmaker_ids IS NULL OR array_length(v_bookmaker_ids, 1) IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Recalculate rollover for all active bonuses of these bookmakers
  FOR v_bonus IN
    SELECT id
    FROM public.project_bookmaker_link_bonuses
    WHERE bookmaker_id = ANY(v_bookmaker_ids)
      AND project_id = v_projeto_id
      AND status = 'credited'
      AND rollover_target_amount IS NOT NULL
      AND rollover_target_amount > 0
  LOOP
    v_new_progress := public.calculate_bonus_rollover(v_bonus.id);
    UPDATE public.project_bookmaker_link_bonuses
    SET rollover_progress = v_new_progress, updated_at = now()
    WHERE id = v_bonus.id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Trigger on apostas_unificada for INSERT, UPDATE, DELETE
CREATE TRIGGER trg_sync_rollover_on_bet_mutation
  AFTER INSERT OR UPDATE OR DELETE ON public.apostas_unificada
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_rollover_on_bet_mutation();


-- 2. Trigger on apostas_pernas for resultado changes, stake edits, deletions
CREATE OR REPLACE FUNCTION public.fn_sync_rollover_on_perna_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bonus RECORD;
  v_new_progress numeric;
  v_bookmaker_id uuid;
  v_projeto_id uuid;
  v_parent_status text;
BEGIN
  -- Get the relevant bookmaker_id
  IF TG_OP = 'DELETE' THEN
    v_bookmaker_id := OLD.bookmaker_id;
  ELSE
    v_bookmaker_id := NEW.bookmaker_id;
  END IF;

  -- Get parent bet info
  SELECT projeto_id, status INTO v_projeto_id, v_parent_status
  FROM public.apostas_unificada
  WHERE id = COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.aposta_id ELSE NEW.aposta_id END,
    NULL
  );

  -- Only recalculate if parent is LIQUIDADA (rollover only counts liquidated bets)
  -- Also act on DELETE since the parent might still be LIQUIDADA or about to change
  IF v_projeto_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- For UPDATE: only act on meaningful changes
  IF TG_OP = 'UPDATE' THEN
    IF NOT (
      OLD.resultado IS DISTINCT FROM NEW.resultado
      OR OLD.stake IS DISTINCT FROM NEW.stake
      OR OLD.odd IS DISTINCT FROM NEW.odd
      OR OLD.bookmaker_id IS DISTINCT FROM NEW.bookmaker_id
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Also handle old bookmaker on bookmaker change
  IF TG_OP = 'UPDATE' AND OLD.bookmaker_id IS DISTINCT FROM NEW.bookmaker_id THEN
    FOR v_bonus IN
      SELECT id FROM public.project_bookmaker_link_bonuses
      WHERE bookmaker_id = OLD.bookmaker_id
        AND project_id = v_projeto_id
        AND status = 'credited'
        AND rollover_target_amount IS NOT NULL AND rollover_target_amount > 0
    LOOP
      v_new_progress := public.calculate_bonus_rollover(v_bonus.id);
      UPDATE public.project_bookmaker_link_bonuses
      SET rollover_progress = v_new_progress, updated_at = now()
      WHERE id = v_bonus.id;
    END LOOP;
  END IF;

  -- Recalculate for the current bookmaker
  FOR v_bonus IN
    SELECT id FROM public.project_bookmaker_link_bonuses
    WHERE bookmaker_id = v_bookmaker_id
      AND project_id = v_projeto_id
      AND status = 'credited'
      AND rollover_target_amount IS NOT NULL AND rollover_target_amount > 0
  LOOP
    v_new_progress := public.calculate_bonus_rollover(v_bonus.id);
    UPDATE public.project_bookmaker_link_bonuses
    SET rollover_progress = v_new_progress, updated_at = now()
    WHERE id = v_bonus.id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_rollover_on_perna_mutation ON public.apostas_pernas;
CREATE TRIGGER trg_sync_rollover_on_perna_mutation
  AFTER INSERT OR UPDATE OR DELETE ON public.apostas_pernas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_rollover_on_perna_mutation();

-- Drop the old function that's no longer needed
DROP FUNCTION IF EXISTS public.fn_sync_rollover_on_liquidation();

COMMENT ON FUNCTION public.fn_sync_rollover_on_bet_mutation() IS 
'Trigger que recalcula rollover automaticamente em qualquer mutação de apostas_unificada (INSERT/UPDATE/DELETE) que envolva status LIQUIDADA.';

COMMENT ON FUNCTION public.fn_sync_rollover_on_perna_mutation() IS 
'Trigger que recalcula rollover automaticamente quando pernas de arbitragem são editadas, liquidadas ou excluídas.';
