
-- Fix stuck operations: all legs resolved but parent still PENDENTE
DO $$
DECLARE
  v_rec RECORD;
  v_recalc RECORD;
BEGIN
  FOR v_rec IN 
    SELECT au.id
    FROM apostas_unificada au
    WHERE au.forma_registro = 'ARBITRAGEM'
      AND au.status NOT IN ('LIQUIDADA', 'CANCELADA')
      AND (SELECT count(*) FROM apostas_pernas ap WHERE ap.aposta_id = au.id AND ap.resultado IS NOT NULL AND ap.resultado != 'PENDENTE') 
        = (SELECT count(*) FROM apostas_pernas ap WHERE ap.aposta_id = au.id)
      AND (SELECT count(*) FROM apostas_pernas ap WHERE ap.aposta_id = au.id) > 0
  LOOP
    -- Use fn_recalc to get proper values
    SELECT * INTO v_recalc FROM fn_recalc_pai_surebet(v_rec.id);
    
    UPDATE apostas_unificada SET
      resultado = v_recalc.resultado_final,
      status = 'LIQUIDADA',
      lucro_prejuizo = v_recalc.lucro_total,
      stake_total = v_recalc.stake_total,
      is_multicurrency = v_recalc.is_multicurrency,
      pl_consolidado = v_recalc.pl_consolidado,
      stake_consolidado = v_recalc.stake_consolidado,
      consolidation_currency = v_recalc.consolidation_currency,
      roi_real = CASE WHEN v_recalc.stake_total > 0 THEN ROUND((v_recalc.lucro_total / v_recalc.stake_total) * 100, 2) ELSE 0 END,
      updated_at = now()
    WHERE id = v_rec.id;
    
    RAISE NOTICE 'Fixed surebet %: resultado=%, lucro=%', v_rec.id, v_recalc.resultado_final, v_recalc.lucro_total;
  END LOOP;
END $$;
