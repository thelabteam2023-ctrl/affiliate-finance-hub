
DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    '082febff-2b33-488d-bcbe-ed15c77b4342'::uuid,
    '313aaa67-cb2b-438c-93c1-5222194604f3'::uuid,
    '0e75f38b-3804-4b32-9123-299f77d47f0b'::uuid
  ];
  v_id uuid;
  v_rec record;
BEGIN
  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_rec FROM fn_recalc_pai_surebet(v_id);
    
    UPDATE apostas_unificada SET
      lucro_prejuizo = v_rec.lucro_total,
      stake = v_rec.stake_total,
      pl_consolidado = v_rec.pl_consolidado,
      stake_consolidado = v_rec.stake_consolidado,
      consolidation_currency = v_rec.consolidation_currency,
      is_multicurrency = v_rec.is_multicurrency,
      resultado = COALESCE(v_rec.resultado_final, resultado),
      updated_at = now()
    WHERE id = v_id;
  END LOOP;
END $$;
