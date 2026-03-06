-- Fix existing multicurrency surebets that have pl_consolidado = NULL
-- by computing it from apostas_pernas using stake_brl_referencia as rate proxy
UPDATE apostas_unificada au
SET 
  pl_consolidado = sub.pl_consolidado,
  stake_consolidado = sub.stake_consolidado,
  is_multicurrency = true,
  consolidation_currency = 'BRL'
FROM (
  SELECT 
    ap.aposta_id,
    ROUND(SUM(
      CASE 
        WHEN ap.lucro_prejuizo_brl_referencia IS NOT NULL THEN ap.lucro_prejuizo_brl_referencia
        WHEN ap.moeda != 'BRL' AND ap.stake_brl_referencia IS NOT NULL AND ap.stake > 0 
          THEN ap.lucro_prejuizo * (ap.stake_brl_referencia / ap.stake)
        ELSE COALESCE(ap.lucro_prejuizo, 0)
      END
    )::numeric, 2) as pl_consolidado,
    ROUND(SUM(
      CASE 
        WHEN ap.moeda != 'BRL' AND ap.stake_brl_referencia IS NOT NULL 
          THEN ap.stake_brl_referencia
        ELSE ap.stake
      END
    )::numeric, 2) as stake_consolidado
  FROM apostas_pernas ap
  WHERE ap.aposta_id IN (
    -- Find surebets with multiple currencies in their pernas
    SELECT DISTINCT ap2.aposta_id
    FROM apostas_pernas ap2
    GROUP BY ap2.aposta_id
    HAVING COUNT(DISTINCT ap2.moeda) > 1
  )
  GROUP BY ap.aposta_id
) sub
WHERE au.id = sub.aposta_id
  AND au.forma_registro = 'ARBITRAGEM'
  AND au.status = 'LIQUIDADA'
  AND au.pl_consolidado IS NULL;