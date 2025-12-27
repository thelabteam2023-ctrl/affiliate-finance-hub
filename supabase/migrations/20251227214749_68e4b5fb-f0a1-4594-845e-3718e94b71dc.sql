-- =============================================
-- SUPORTE MULTI-MOEDA: CAMPOS DE SNAPSHOT DE CONVERSÃO
-- =============================================
-- Objetivo: Adicionar campos para registrar snapshots de conversão
-- no momento exato da operação. A conversão é APENAS para controle,
-- nunca para execução. Valores históricos NUNCA são recalculados.

-- =============================================
-- 1. apostas_unificada - Adicionar campos de snapshot
-- =============================================
ALTER TABLE public.apostas_unificada
  ADD COLUMN IF NOT EXISTS moeda_operacao TEXT DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS cotacao_snapshot DECIMAL(16,8),
  ADD COLUMN IF NOT EXISTS cotacao_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valor_brl_referencia DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS lucro_prejuizo_brl_referencia DECIMAL(14,2);

COMMENT ON COLUMN public.apostas_unificada.moeda_operacao IS 'Moeda da operação (herdada da bookmaker). Nunca muda.';
COMMENT ON COLUMN public.apostas_unificada.cotacao_snapshot IS 'Taxa de conversão para BRL no momento do registro (snapshot).';
COMMENT ON COLUMN public.apostas_unificada.cotacao_snapshot_at IS 'Data/hora do snapshot da cotação.';
COMMENT ON COLUMN public.apostas_unificada.valor_brl_referencia IS 'Valor de referência em BRL (stake * cotacao_snapshot). Apenas controle.';
COMMENT ON COLUMN public.apostas_unificada.lucro_prejuizo_brl_referencia IS 'Lucro/prejuízo de referência em BRL. Apenas controle.';

-- =============================================
-- 2. project_bookmaker_link_bonuses - Adicionar campos de snapshot
-- =============================================
ALTER TABLE public.project_bookmaker_link_bonuses
  ADD COLUMN IF NOT EXISTS cotacao_credito_snapshot DECIMAL(16,8),
  ADD COLUMN IF NOT EXISTS cotacao_credito_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valor_brl_referencia DECIMAL(14,2);

COMMENT ON COLUMN public.project_bookmaker_link_bonuses.cotacao_credito_snapshot IS 'Taxa de conversão para BRL no momento do crédito do bônus.';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.cotacao_credito_at IS 'Data/hora do snapshot da cotação de crédito.';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.valor_brl_referencia IS 'Valor do bônus em BRL de referência. Apenas controle.';

-- =============================================
-- 3. freebets_recebidas - Adicionar campos de snapshot
-- =============================================
ALTER TABLE public.freebets_recebidas
  ADD COLUMN IF NOT EXISTS moeda_operacao TEXT DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS cotacao_snapshot DECIMAL(16,8),
  ADD COLUMN IF NOT EXISTS cotacao_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valor_brl_referencia DECIMAL(14,2);

COMMENT ON COLUMN public.freebets_recebidas.moeda_operacao IS 'Moeda da freebet (herdada da bookmaker).';
COMMENT ON COLUMN public.freebets_recebidas.cotacao_snapshot IS 'Taxa de conversão para BRL no momento do recebimento.';
COMMENT ON COLUMN public.freebets_recebidas.cotacao_snapshot_at IS 'Data/hora do snapshot da cotação.';
COMMENT ON COLUMN public.freebets_recebidas.valor_brl_referencia IS 'Valor de referência em BRL. Apenas controle.';

-- =============================================
-- 4. projeto_ciclos - Adicionar campos de snapshot consolidado
-- =============================================
ALTER TABLE public.projeto_ciclos
  ADD COLUMN IF NOT EXISTS lucro_bruto_usd DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS lucro_liquido_usd DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS cotacao_fechamento DECIMAL(16,8),
  ADD COLUMN IF NOT EXISTS cotacao_fechamento_at TIMESTAMPTZ;

COMMENT ON COLUMN public.projeto_ciclos.lucro_bruto_usd IS 'Lucro bruto em USD (soma de operações em casas USD).';
COMMENT ON COLUMN public.projeto_ciclos.lucro_liquido_usd IS 'Lucro líquido em USD após deduções.';
COMMENT ON COLUMN public.projeto_ciclos.cotacao_fechamento IS 'Taxa de conversão USD/BRL no momento do fechamento do ciclo.';
COMMENT ON COLUMN public.projeto_ciclos.cotacao_fechamento_at IS 'Data/hora do snapshot da cotação de fechamento.';

-- =============================================
-- 5. Índice para consultas de moeda
-- =============================================
CREATE INDEX IF NOT EXISTS idx_apostas_unificada_moeda_operacao 
  ON public.apostas_unificada(moeda_operacao);

CREATE INDEX IF NOT EXISTS idx_freebets_recebidas_moeda_operacao 
  ON public.freebets_recebidas(moeda_operacao);