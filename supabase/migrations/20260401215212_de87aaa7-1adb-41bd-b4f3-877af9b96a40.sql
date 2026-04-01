
-- 1. Normalizar saldos residuais (-0.01 a +0.01) para zero em contas desvinculadas
UPDATE bookmakers 
SET saldo_atual = 0
WHERE projeto_id IS NULL 
  AND ABS(saldo_atual) > 0 
  AND ABS(saldo_atual) <= 0.01;

-- 2. Recriar view v_bookmakers_desvinculados COM filtro de saldo residual
-- Casas com saldo zero/residual E status diferente de AGUARDANDO_DECISAO não devem aparecer
CREATE OR REPLACE VIEW v_bookmakers_desvinculados AS
SELECT 
  b.id,
  b.nome,
  b.status,
  b.saldo_atual,
  b.saldo_usd,
  b.saldo_freebet,
  b.moeda,
  b.workspace_id,
  b.parceiro_id,
  p.nome AS parceiro_nome,
  COALESCE(b.saldo_atual, 0) AS saldo_efetivo,
  COALESCE(b.saldo_atual, 0) + COALESCE(b.saldo_freebet, 0) AS saldo_total
FROM bookmakers b
LEFT JOIN parceiros p ON b.parceiro_id = p.id
LEFT JOIN bookmaker_unlinked_acks ack ON ack.bookmaker_id = b.id AND ack.workspace_id = b.workspace_id
WHERE b.projeto_id IS NULL
  AND UPPER(b.status) = ANY(ARRAY['ATIVO', 'AGUARDANDO_DECISAO', 'LIMITADA'])
  AND b.aguardando_saque_at IS NULL
  AND ack.id IS NULL
  AND b.workspace_id = get_current_workspace()
  -- NOVO: Só mostrar se tem saldo relevante (> 0.01) OU está aguardando decisão
  AND (
    UPPER(b.status) = 'AGUARDANDO_DECISAO'
    OR (COALESCE(b.saldo_atual, 0) + COALESCE(b.saldo_freebet, 0)) > 0.01
  );
