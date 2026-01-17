-- FASE 2: Migração de saldo de bônus para saldo unificado
-- Esta migração transfere o saldo_atual de bônus creditados para o saldo_atual do bookmaker

-- 1. Atualizar saldo_atual dos bookmakers adicionando o saldo de bônus ativo
UPDATE bookmakers b
SET 
  saldo_atual = b.saldo_atual + COALESCE(bonus_totals.total_bonus, 0),
  updated_at = now()
FROM (
  SELECT 
    bookmaker_id,
    SUM(saldo_atual) as total_bonus
  FROM project_bookmaker_link_bonuses
  WHERE status = 'credited'
    AND saldo_atual > 0
    AND (migrado_para_saldo_unificado = false OR migrado_para_saldo_unificado IS NULL)
  GROUP BY bookmaker_id
) bonus_totals
WHERE b.id = bonus_totals.bookmaker_id;

-- 2. Registrar o valor migrado e zerar o saldo_atual dos bônus migrados
UPDATE project_bookmaker_link_bonuses
SET 
  valor_creditado_no_saldo = CASE 
    WHEN valor_creditado_no_saldo = 0 THEN saldo_atual 
    ELSE valor_creditado_no_saldo + saldo_atual 
  END,
  saldo_atual = 0,
  migrado_para_saldo_unificado = true,
  updated_at = now()
WHERE status = 'credited'
  AND saldo_atual > 0
  AND (migrado_para_saldo_unificado = false OR migrado_para_saldo_unificado IS NULL);

-- 3. Também marcar bônus já com saldo 0 como migrados (para consistência)
UPDATE project_bookmaker_link_bonuses
SET 
  migrado_para_saldo_unificado = true,
  updated_at = now()
WHERE (migrado_para_saldo_unificado = false OR migrado_para_saldo_unificado IS NULL)
  AND status IN ('credited', 'finalized');

-- Comentário explicativo
COMMENT ON TABLE project_bookmaker_link_bonuses IS 
'Tabela de bônus - pós migração de unificação. O campo saldo_atual não é mais usado operacionalmente. 
O saldo de bônus agora faz parte do saldo_atual do bookmaker. 
Esta tabela serve apenas para rastreamento histórico e analítico de bônus recebidos.';