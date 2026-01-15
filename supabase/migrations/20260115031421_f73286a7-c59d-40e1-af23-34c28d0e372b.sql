
-- =====================================================
-- CORREÇÃO: EXCLUSÃO MÚTUA ENTRE ESTADOS DE SAQUE
-- =====================================================
-- 
-- PROBLEMA IDENTIFICADO:
-- 1. "Saques Aguardando Confirmação" (cash_ledger.status = 'PENDENTE')
-- 2. "Saques Pendentes de Processamento" (v_painel_operacional.BOOKMAKER_SAQUE)
-- 3. "Casas Limitadas" (v_painel_operacional.BOOKMAKER_LIMITADA)
-- 
-- Regra de exclusão mútua:
-- - Se existe transação SAQUE+PENDENTE no cash_ledger → NÃO deve aparecer em BOOKMAKER_SAQUE nem BOOKMAKER_LIMITADA
-- - BOOKMAKER_SAQUE = casas marcadas para saque (aguardando_saque_at) SEM transação pendente
-- - BOOKMAKER_LIMITADA = casas limitadas SEM aguardando_saque_at E SEM transação pendente
-- =====================================================

-- 1. Recriar view v_bookmakers_aguardando_saque (APENAS casas marcadas, SEM transação pendente)
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
  b.aguardando_saque_at AS data_liberacao,
  CASE 
    WHEN b.moeda IN ('USD', 'USDT') THEN COALESCE(b.saldo_usd, 0)
    ELSE COALESCE(b.saldo_atual, 0)
  END AS saldo_efetivo
FROM bookmakers b
LEFT JOIN parceiros pa ON b.parceiro_id = pa.id
LEFT JOIN projetos pr ON b.projeto_id = pr.id
WHERE 
  -- APENAS casas com workflow de saque ativo
  b.aguardando_saque_at IS NOT NULL 
  -- EXCLUIR se já existe transação de saque pendente (já está em "Aguardando Confirmação")
  AND NOT EXISTS (
    SELECT 1 FROM cash_ledger cl 
    WHERE cl.origem_bookmaker_id = b.id 
      AND cl.tipo_transacao = 'SAQUE' 
      AND cl.status = 'PENDENTE'
  )
  -- CRÍTICO: só incluir se realmente tem saldo
  AND (
    (b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_usd > 0.5)
    OR (b.moeda NOT IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_atual > 0.5)
  );

-- 2. Recriar view v_painel_operacional com EXCLUSÃO MÚTUA
DROP VIEW IF EXISTS v_painel_operacional;
CREATE VIEW v_painel_operacional AS

-- =====================================================
-- ALERTAS DE SAQUE PENDENTE DE PROCESSAMENTO
-- Casas marcadas para saque (aguardando_saque_at != null)
-- MAS que ainda não têm transação de saque criada no cash_ledger
-- =====================================================
SELECT 
  b.id AS entidade_id,
  b.user_id,
  'BOOKMAKER_SAQUE'::text AS tipo_alerta,
  'BOOKMAKER'::text AS entidade_tipo,
  b.nome AS titulo,
  'Pendente de processamento - aguarda registro no Caixa'::text AS descricao,
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
  -- Casa marcada para saque
  AND b.aguardando_saque_at IS NOT NULL 
  -- EXCLUSÃO MÚTUA: Se já tem transação PENDENTE, não aparece aqui
  AND NOT EXISTS (
    SELECT 1 FROM cash_ledger cl 
    WHERE cl.origem_bookmaker_id = b.id 
      AND cl.tipo_transacao = 'SAQUE' 
      AND cl.status = 'PENDENTE'
  )
  -- Só se tem saldo real
  AND (
    (b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_usd > 0.5)
    OR (b.moeda NOT IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_atual > 0.5)
  )

UNION ALL

-- =====================================================
-- ALERTAS DE CASAS LIMITADAS
-- Casas com estado_conta ou status = 'limitada'
-- MAS que NÃO estão no workflow de saque
-- E que NÃO têm transação de saque pendente
-- =====================================================
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
  -- EXCLUSÃO MÚTUA 1: Não está no workflow de saque
  AND b.aguardando_saque_at IS NULL
  -- EXCLUSÃO MÚTUA 2: Não tem transação de saque pendente no cash_ledger
  AND NOT EXISTS (
    SELECT 1 FROM cash_ledger cl 
    WHERE cl.origem_bookmaker_id = b.id 
      AND cl.tipo_transacao = 'SAQUE' 
      AND cl.status = 'PENDENTE'
  )
  -- Só se tem saldo
  AND (
    (b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_usd > 0.5)
    OR (b.moeda NOT IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_atual > 0.5)
  );

-- =====================================================
-- Adicionar comentário explicativo para futura manutenção
-- =====================================================
COMMENT ON VIEW v_painel_operacional IS 
'View de alertas operacionais com EXCLUSÃO MÚTUA entre estados de saque:
- BOOKMAKER_SAQUE: Casa marcada para saque (aguardando_saque_at != null) SEM transação pendente
- BOOKMAKER_LIMITADA: Casa limitada SEM aguardando_saque_at E SEM transação pendente
- Saques Aguardando Confirmação: Gerenciado via cash_ledger.status = PENDENTE (não nesta view)

Fluxo de estados:
1. Casa limitada aparece em BOOKMAKER_LIMITADA
2. Gestor clica "Sacar" → marca aguardando_saque_at → move para BOOKMAKER_SAQUE
3. Tesouraria processa saque → cria transação PENDENTE no cash_ledger → some de BOOKMAKER_SAQUE
4. Transação aparece em "Saques Aguardando Confirmação" (query direta cash_ledger)
5. Confirmação do saque → status = CONFIRMADO → transação some do card
6. Se saldo zerou, limpa aguardando_saque_at

Estados são MUTUAMENTE EXCLUSIVOS.';
