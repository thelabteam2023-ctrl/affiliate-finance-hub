
-- ============================================================================
-- RECONCILIAÇÃO: Aposta 4555b676 (Real Madrid x Bayern - Duplo Green)
-- 
-- BUG: Freebet RED pernas tinham lucro_prejuizo = -stake (incorreto)
-- FIX: Freebet RED = 0 (sem custo real). Recalcula pai.
-- ============================================================================

-- 1. Corrigir lucro_prejuizo das 3 pernas FREEBET RED → 0
UPDATE apostas_pernas 
SET lucro_prejuizo = 0, updated_at = now()
WHERE aposta_id = '4555b676-4cae-4e5f-9ed6-fe49e36981e7'
  AND fonte_saldo = 'FREEBET'
  AND resultado = 'RED'
  AND lucro_prejuizo < 0;

-- 2. Recalcular registro pai
-- Novo lucro = 0 + 0 + 0 + (-460) + (-550) + 1276.35 = +266.35
UPDATE apostas_unificada 
SET 
  lucro_prejuizo = (
    SELECT COALESCE(SUM(lucro_prejuizo), 0) 
    FROM apostas_pernas 
    WHERE aposta_id = '4555b676-4cae-4e5f-9ed6-fe49e36981e7'
  ),
  resultado = 'GREEN',
  roi_real = (
    SELECT CASE WHEN SUM(stake) > 0 
      THEN (SUM(lucro_prejuizo) / SUM(stake)) * 100 
      ELSE 0 END
    FROM apostas_pernas 
    WHERE aposta_id = '4555b676-4cae-4e5f-9ed6-fe49e36981e7'
  ),
  updated_at = now()
WHERE id = '4555b676-4cae-4e5f-9ed6-fe49e36981e7';

-- 3. Verificar se existem OUTRAS apostas afetadas pelo mesmo bug
-- (freebet RED pernas com lucro_prejuizo negativo)
-- Nota: A RPC corrigida previne novos casos, mas dados históricos podem estar errados
