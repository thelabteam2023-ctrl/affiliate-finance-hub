
-- 1. Atualizar cotacao_snapshot e stake_brl_referencia das pernas EUR
-- para usar a Cotação de Trabalho (5.891) em vez da cotação API (5.8726)
UPDATE apostas_pernas
SET 
  cotacao_snapshot = 5.891,
  stake_brl_referencia = stake * 5.891,
  updated_at = now()
WHERE aposta_id IN (
  '082febff-2b33-488d-bcbe-ed15c77b4342',
  '313aaa67-cb2b-438c-93c1-5222194604f3',
  '0e75f38b-3804-4b32-9123-299f77d47f0b',
  '89de227a-9276-42fa-bb64-6128c5bfee89'
)
AND moeda = 'EUR';

-- 2. Recalcular pl_consolidado de todas as 5 surebets (incluindo GOIÁS que tem null)
DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    '082febff-2b33-488d-bcbe-ed15c77b4342'::uuid,
    '313aaa67-cb2b-438c-93c1-5222194604f3'::uuid,
    '0e75f38b-3804-4b32-9123-299f77d47f0b'::uuid,
    'a2d808ef-4c33-4010-a659-4c383ce94396'::uuid,
    '89de227a-9276-42fa-bb64-6128c5bfee89'::uuid
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
