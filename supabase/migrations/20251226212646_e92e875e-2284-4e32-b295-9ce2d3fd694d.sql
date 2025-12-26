-- Adicionar campos de decomposição de stake na tabela apostas_unificada
ALTER TABLE apostas_unificada 
ADD COLUMN IF NOT EXISTS stake_real numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS stake_bonus numeric DEFAULT 0;

-- Adicionar campo de saldo atual do bônus na tabela de bônus
-- Isso permite rastrear quanto do bônus foi consumido
ALTER TABLE project_bookmaker_link_bonuses 
ADD COLUMN IF NOT EXISTS saldo_atual numeric DEFAULT 0;

-- Atualizar saldo_atual para bônus creditados existentes (igual ao bonus_amount original)
UPDATE project_bookmaker_link_bonuses 
SET saldo_atual = bonus_amount 
WHERE status = 'credited' AND (saldo_atual IS NULL OR saldo_atual = 0);

-- Para bônus finalizados, manter saldo_atual = 0 (já consumido/expirado)
UPDATE project_bookmaker_link_bonuses 
SET saldo_atual = 0 
WHERE status IN ('finalized', 'expired', 'reversed', 'failed');

-- Backfill apostas existentes: assumir que stake era 100% real para apostas sem contexto BONUS
UPDATE apostas_unificada 
SET stake_real = COALESCE(stake, 0), stake_bonus = 0 
WHERE contexto_operacional != 'BONUS' AND (stake_real IS NULL OR stake_real = 0);

-- Para apostas em contexto BONUS existentes, assumir stake era 100% bônus
UPDATE apostas_unificada 
SET stake_real = 0, stake_bonus = COALESCE(stake, 0) 
WHERE contexto_operacional = 'BONUS' AND (stake_bonus IS NULL OR stake_bonus = 0);

-- Comentários explicativos
COMMENT ON COLUMN apostas_unificada.stake_real IS 'Parte da stake que veio do saldo real da bookmaker';
COMMENT ON COLUMN apostas_unificada.stake_bonus IS 'Parte da stake que veio do saldo de bônus ativo';
COMMENT ON COLUMN project_bookmaker_link_bonuses.saldo_atual IS 'Saldo atual do bônus (decrementado em RED, pode ser recomposto em GREEN)';