-- =====================================================
-- MIGRATION: Normalização de Saldos USD Divergentes
-- =====================================================
-- Objetivo: Consolidar saldo_atual e saldo_usd para casas USD,
-- eliminando divergências históricas causadas por triggers antigas.

-- 1. Normalizar todos os registros USD divergentes
-- Usa GREATEST() para não perder nenhum valor
UPDATE bookmakers
SET 
  saldo_atual = GREATEST(COALESCE(saldo_atual, 0), COALESCE(saldo_usd, 0)),
  saldo_usd = GREATEST(COALESCE(saldo_atual, 0), COALESCE(saldo_usd, 0)),
  updated_at = NOW()
WHERE moeda IN ('USD', 'USDT', 'USDC')
  AND (saldo_atual IS DISTINCT FROM saldo_usd);

-- 2. Adicionar comentários de documentação para colunas deprecated
COMMENT ON COLUMN bookmakers.saldo_usd IS 'DEPRECATED: Legado. Usar saldo_atual como fonte única. Mantido apenas para compatibilidade histórica. Sincronizado automaticamente pela trigger.';
COMMENT ON COLUMN bookmakers.saldo_irrecuperavel IS 'DEPRECATED: Sem uso operacional. Candidata a remoção futura.';