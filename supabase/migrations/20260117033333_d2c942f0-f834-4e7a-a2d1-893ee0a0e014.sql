-- FASE 1: Preparação para unificação de saldo (SEM IMPACTO OPERACIONAL)
-- Esta migração apenas adiciona campos para rastreamento histórico

-- 1. Adicionar campo para rastrear quanto foi efetivamente creditado no saldo do bookmaker
ALTER TABLE project_bookmaker_link_bonuses 
  ADD COLUMN IF NOT EXISTS valor_creditado_no_saldo NUMERIC DEFAULT 0;

-- 2. Adicionar campo para marcar se o bônus já foi migrado para o modelo unificado
ALTER TABLE project_bookmaker_link_bonuses 
  ADD COLUMN IF NOT EXISTS migrado_para_saldo_unificado BOOLEAN DEFAULT FALSE;

-- 3. Preencher valor_creditado_no_saldo para bônus existentes com status 'credited'
-- Isso preserva o histórico de quanto cada bônus creditou
UPDATE project_bookmaker_link_bonuses
SET valor_creditado_no_saldo = COALESCE(bonus_amount, 0)
WHERE status IN ('credited', 'finalized')
  AND valor_creditado_no_saldo = 0;

-- 4. Comentário explicativo na tabela
COMMENT ON COLUMN project_bookmaker_link_bonuses.valor_creditado_no_saldo IS 
'Valor histórico que foi creditado no saldo do bookmaker. Usado para análise - NÃO interfere em operações.';

COMMENT ON COLUMN project_bookmaker_link_bonuses.migrado_para_saldo_unificado IS 
'Flag indicando se este bônus já teve seu saldo_atual transferido para bookmakers.saldo_atual na migração de unificação.';