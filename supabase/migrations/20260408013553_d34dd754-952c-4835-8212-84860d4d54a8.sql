
-- ============================================================================
-- RECONCILIAÇÃO EM MASSA: Corrigir TODAS as pernas freebet RED com lucro negativo
-- ============================================================================

-- 1. Corrigir lucro_prejuizo de TODAS as pernas freebet RED
UPDATE apostas_pernas 
SET lucro_prejuizo = 0, updated_at = now()
WHERE fonte_saldo = 'FREEBET'
  AND resultado = 'RED'
  AND lucro_prejuizo < 0;

-- 2. Recalcular TODOS os registros pai afetados
UPDATE apostas_unificada au
SET 
  lucro_prejuizo = sub.lucro_total,
  resultado = CASE 
    WHEN sub.todas_liquidadas AND sub.lucro_total > 0 THEN 'GREEN'
    WHEN sub.todas_liquidadas AND sub.lucro_total < 0 THEN 'RED'
    WHEN sub.todas_liquidadas AND sub.lucro_total = 0 THEN 'VOID'
    ELSE au.resultado
  END,
  roi_real = CASE 
    WHEN sub.todas_liquidadas AND sub.stake_total > 0 THEN (sub.lucro_total / sub.stake_total) * 100
    ELSE au.roi_real
  END,
  updated_at = now()
FROM (
  SELECT 
    ap.aposta_id,
    COALESCE(SUM(ap.lucro_prejuizo), 0) as lucro_total,
    COALESCE(SUM(ap.stake), 0) as stake_total,
    bool_and(ap.resultado IS NOT NULL AND ap.resultado != 'PENDENTE') as todas_liquidadas
  FROM apostas_pernas ap
  WHERE ap.aposta_id IN (
    SELECT DISTINCT aposta_id 
    FROM apostas_pernas 
    WHERE fonte_saldo = 'FREEBET' 
      AND resultado = 'RED'
      AND lucro_prejuizo = 0  -- already fixed by step 1
  )
  GROUP BY ap.aposta_id
) sub
WHERE au.id = sub.aposta_id
  AND au.status = 'LIQUIDADA';
