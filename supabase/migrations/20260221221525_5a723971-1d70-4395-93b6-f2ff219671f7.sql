
-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.tr_auto_sync_bonus_rollover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bookmaker_ids uuid[];
  v_bk_id uuid;
  v_bonus RECORD;
BEGIN
  v_bookmaker_ids := ARRAY[]::uuid[];

  IF NEW.bookmaker_id IS NOT NULL THEN
    v_bookmaker_ids := array_append(v_bookmaker_ids, NEW.bookmaker_id);
  END IF;

  IF NEW.pernas IS NOT NULL AND jsonb_typeof(NEW.pernas) = 'array' AND jsonb_array_length(NEW.pernas) > 0 THEN
    SELECT array_agg(DISTINCT bid) INTO v_bookmaker_ids
    FROM (
      SELECT unnest(v_bookmaker_ids) AS bid
      UNION
      SELECT (p->>'bookmaker_id')::uuid
      FROM jsonb_array_elements(NEW.pernas) p
      WHERE (p->>'bookmaker_id') IS NOT NULL
    ) sub(bid);
  END IF;

  IF v_bookmaker_ids IS NOT NULL AND array_length(v_bookmaker_ids, 1) > 0 THEN
    FOREACH v_bk_id IN ARRAY v_bookmaker_ids
    LOOP
      FOR v_bonus IN
        SELECT id FROM project_bookmaker_link_bonuses
        WHERE bookmaker_id = v_bk_id
          AND project_id = NEW.projeto_id
          AND status = 'credited'
          AND rollover_target_amount > 0
      LOOP
        PERFORM sync_bonus_rollover(v_bonus.id);
      END LOOP;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tr_auto_sync_bonus_rollover() IS
'Auto-syncs rollover progress for all active bonuses of affected bookmakers whenever a bet is liquidated or its result changes.';

-- 2. Drop any existing triggers
DROP TRIGGER IF EXISTS tr_apostas_sync_rollover ON apostas_unificada;
DROP TRIGGER IF EXISTS tr_apostas_sync_rollover_insert ON apostas_unificada;
DROP TRIGGER IF EXISTS tr_apostas_sync_rollover_update ON apostas_unificada;

-- 3. INSERT trigger (cannot reference OLD)
CREATE TRIGGER tr_apostas_sync_rollover_insert
  AFTER INSERT ON apostas_unificada
  FOR EACH ROW
  WHEN (NEW.status = 'LIQUIDADA')
  EXECUTE FUNCTION tr_auto_sync_bonus_rollover();

-- 4. UPDATE trigger (can reference OLD)
CREATE TRIGGER tr_apostas_sync_rollover_update
  AFTER UPDATE OF status, resultado ON apostas_unificada
  FOR EACH ROW
  WHEN (NEW.status = 'LIQUIDADA' OR OLD.status = 'LIQUIDADA')
  EXECUTE FUNCTION tr_auto_sync_bonus_rollover();
