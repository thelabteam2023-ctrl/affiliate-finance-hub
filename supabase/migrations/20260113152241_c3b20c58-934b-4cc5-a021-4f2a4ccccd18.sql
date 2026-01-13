
-- =====================================================
-- CORREÇÃO COMPLETA: Estados de Bookmaker
-- =====================================================

-- 1. Adicionar campo para tracking de workflow de saque (nullable timestamp)
-- Quando preenchido, indica que o saque foi solicitado e está pendente
ALTER TABLE bookmakers 
ADD COLUMN IF NOT EXISTS aguardando_saque_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Adicionar campo para preservar o estado anterior antes de marcar para saque
ALTER TABLE bookmakers 
ADD COLUMN IF NOT EXISTS estado_conta TEXT DEFAULT 'ativo' 
CHECK (estado_conta IN ('ativo', 'limitada', 'encerrada'));

-- 3. Migrar dados existentes: preencher estado_conta baseado em status atual
UPDATE bookmakers 
SET estado_conta = CASE 
  WHEN status = 'limitada' THEN 'limitada'
  WHEN status = 'ativo' THEN 'ativo'
  WHEN status = 'AGUARDANDO_SAQUE' THEN 'ativo' -- casos inconsistentes voltam para ativo
  ELSE 'ativo'
END
WHERE estado_conta IS NULL OR estado_conta = 'ativo';

-- 4. Para bookmakers com AGUARDANDO_SAQUE E saldo > 0, manter o workflow
UPDATE bookmakers 
SET aguardando_saque_at = updated_at
WHERE status = 'AGUARDANDO_SAQUE' 
  AND (saldo_atual > 0.5 OR saldo_usd > 0.5);

-- 5. Corrigir dados inconsistentes: AGUARDANDO_SAQUE com saldo zero volta para ativo
UPDATE bookmakers 
SET 
  status = 'ativo',
  aguardando_saque_at = NULL
WHERE status = 'AGUARDANDO_SAQUE' 
  AND saldo_atual <= 0.5 
  AND saldo_usd <= 0.5;

-- 6. Recriar view v_bookmakers_aguardando_saque com lógica DERIVADA
DROP VIEW IF EXISTS v_bookmakers_aguardando_saque;
CREATE VIEW v_bookmakers_aguardando_saque AS
SELECT 
  b.id AS bookmaker_id,
  b.user_id,
  b.nome AS bookmaker_nome,
  b.saldo_atual,
  b.saldo_usd,
  b.saldo_freebet,
  b.moeda,
  b.status,
  b.estado_conta,
  b.parceiro_id,
  pa.nome AS parceiro_nome,
  b.projeto_id,
  pr.nome AS projeto_nome,
  COALESCE(b.aguardando_saque_at, b.updated_at) AS data_liberacao,
  CASE 
    WHEN b.moeda IN ('USD', 'USDT') THEN COALESCE(b.saldo_usd, 0)
    ELSE COALESCE(b.saldo_atual, 0)
  END AS saldo_efetivo
FROM bookmakers b
LEFT JOIN parceiros pa ON b.parceiro_id = pa.id
LEFT JOIN projetos pr ON b.projeto_id = pr.id
WHERE 
  -- NOVA LÓGICA: usa campo de workflow OU tem transação de saque pendente
  (
    b.aguardando_saque_at IS NOT NULL 
    OR EXISTS (
      SELECT 1 FROM cash_ledger cl 
      WHERE cl.origem_bookmaker_id = b.id 
        AND cl.tipo_transacao = 'SAQUE' 
        AND cl.status = 'PENDENTE'
    )
  )
  -- CRÍTICO: só incluir se realmente tem saldo
  AND (
    (b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_usd > 0.5)
    OR (b.moeda NOT IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_atual > 0.5)
  );

-- 7. Atualizar view v_painel_operacional para usar nova lógica
DROP VIEW IF EXISTS v_painel_operacional;
CREATE VIEW v_painel_operacional AS
-- Alertas de saque pendente (derivado de workflow ou transação)
SELECT 
  b.id AS entidade_id,
  b.user_id,
  'BOOKMAKER_SAQUE'::text AS tipo_alerta,
  'BOOKMAKER'::text AS entidade_tipo,
  b.nome AS titulo,
  'Aguardando confirmação de saque'::text AS descricao,
  (CASE 
    WHEN b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') THEN b.saldo_usd
    ELSE b.saldo_atual
  END)::numeric(15,2) AS valor,
  b.moeda,
  'MEDIO'::text AS nivel_urgencia,
  2 AS ordem_urgencia,
  NULL::date AS data_limite,
  b.created_at,
  b.parceiro_id,
  (SELECT p.nome FROM parceiros p WHERE p.id = b.parceiro_id) AS parceiro_nome,
  b.projeto_id,
  (SELECT pr.nome FROM projetos pr WHERE pr.id = b.projeto_id) AS projeto_nome,
  b.estado_conta AS status_anterior
FROM bookmakers b
WHERE 
  b.workspace_id = get_current_workspace()
  -- NOVA LÓGICA DERIVADA
  AND (
    b.aguardando_saque_at IS NOT NULL 
    OR EXISTS (
      SELECT 1 FROM cash_ledger cl 
      WHERE cl.origem_bookmaker_id = b.id 
        AND cl.tipo_transacao = 'SAQUE' 
        AND cl.status = 'PENDENTE'
    )
  )
  -- Só se tem saldo real
  AND (
    (b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_usd > 0.5)
    OR (b.moeda NOT IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_atual > 0.5)
  )

UNION ALL

-- Alertas de casas limitadas (estado_conta ou status legado)
SELECT 
  b.id AS entidade_id,
  b.user_id,
  'BOOKMAKER_LIMITADA'::text AS tipo_alerta,
  'BOOKMAKER'::text AS entidade_tipo,
  b.nome AS titulo,
  'Casa limitada - necessário sacar saldo ou realocar'::text AS descricao,
  (CASE 
    WHEN b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') THEN b.saldo_usd
    ELSE b.saldo_atual
  END)::numeric(15,2) AS valor,
  b.moeda,
  CASE 
    WHEN (CASE WHEN b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') THEN b.saldo_usd ELSE b.saldo_atual END) > 1000 
    THEN 'ALTO'::text 
    ELSE 'MEDIO'::text 
  END AS nivel_urgencia,
  CASE 
    WHEN (CASE WHEN b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') THEN b.saldo_usd ELSE b.saldo_atual END) > 1000 
    THEN 1 
    ELSE 2 
  END AS ordem_urgencia,
  NULL::date AS data_limite,
  b.created_at,
  b.parceiro_id,
  (SELECT p.nome FROM parceiros p WHERE p.id = b.parceiro_id) AS parceiro_nome,
  b.projeto_id,
  (SELECT pr.nome FROM projetos pr WHERE pr.id = b.projeto_id) AS projeto_nome,
  b.estado_conta AS status_anterior
FROM bookmakers b
WHERE 
  b.workspace_id = get_current_workspace()
  -- Usa estado_conta OU status legado
  AND (b.estado_conta = 'limitada' OR b.status = 'limitada')
  -- Exclui quem já está no fluxo de saque
  AND b.aguardando_saque_at IS NULL
  -- Só se tem saldo
  AND (
    (b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_usd > 0.5)
    OR (b.moeda NOT IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_atual > 0.5)
  );

-- 8. Criar função para marcar bookmaker para saque (preserva estado anterior)
CREATE OR REPLACE FUNCTION marcar_para_saque(p_bookmaker_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE bookmakers 
  SET 
    aguardando_saque_at = NOW(),
    -- Preserva o estado atual da conta antes de entrar em workflow
    estado_conta = CASE 
      WHEN status = 'limitada' THEN 'limitada'
      WHEN estado_conta = 'limitada' THEN 'limitada'
      ELSE 'ativo'
    END
  WHERE id = p_bookmaker_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Criar função para confirmar saque (limpa workflow e restaura estado)
CREATE OR REPLACE FUNCTION confirmar_saque_concluido(p_bookmaker_id UUID)
RETURNS VOID AS $$
DECLARE
  v_estado_anterior TEXT;
BEGIN
  -- Buscar estado anterior
  SELECT estado_conta INTO v_estado_anterior
  FROM bookmakers WHERE id = p_bookmaker_id;
  
  -- Limpar workflow e restaurar status
  UPDATE bookmakers 
  SET 
    aguardando_saque_at = NULL,
    status = COALESCE(v_estado_anterior, 'ativo')
  WHERE id = p_bookmaker_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Adicionar comentários para documentação
COMMENT ON COLUMN bookmakers.aguardando_saque_at IS 'Timestamp de quando foi marcado para saque. NULL = não está em workflow de saque.';
COMMENT ON COLUMN bookmakers.estado_conta IS 'Estado real da conta (ativo/limitada). Independente de workflow de saque.';
COMMENT ON FUNCTION marcar_para_saque IS 'Marca bookmaker para saque preservando estado da conta.';
COMMENT ON FUNCTION confirmar_saque_concluido IS 'Confirma saque e restaura estado anterior da conta.';
