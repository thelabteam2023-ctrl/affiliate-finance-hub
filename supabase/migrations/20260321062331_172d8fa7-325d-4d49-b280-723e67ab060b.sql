
-- Recalculate saldo_atual and saldo_freebet for ALL bookmakers from financial_events
-- This fixes discrepancies caused by the broken reprocessar_ledger_workspace
DO $$
DECLARE
  v_bk RECORD;
  v_saldo_calc NUMERIC;
  v_freebet_calc NUMERIC;
  v_count INT := 0;
BEGIN
  FOR v_bk IN 
    SELECT DISTINCT b.id, b.saldo_atual, b.saldo_freebet
    FROM bookmakers b
    WHERE b.workspace_id = 'feee9758-a7f4-474c-b2b1-679b66ec1cd9'
  LOOP
    -- Calculate saldo_atual from non-freebet events
    SELECT COALESCE(SUM(valor), 0) INTO v_saldo_calc
    FROM financial_events 
    WHERE bookmaker_id = v_bk.id 
      AND (tipo_uso IS NULL OR tipo_uso != 'FREEBET');
    
    -- Calculate saldo_freebet from freebet events
    SELECT COALESCE(SUM(valor), 0) INTO v_freebet_calc
    FROM financial_events 
    WHERE bookmaker_id = v_bk.id 
      AND tipo_uso = 'FREEBET';
    
    -- Only update if there's a difference
    IF ABS(v_bk.saldo_atual - v_saldo_calc) > 0.001 OR ABS(v_bk.saldo_freebet - v_freebet_calc) > 0.001 THEN
      UPDATE bookmakers 
      SET saldo_atual = v_saldo_calc,
          saldo_freebet = v_freebet_calc,
          updated_at = NOW()
      WHERE id = v_bk.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Bookmakers corrigidas: %', v_count;
END;
$$;
