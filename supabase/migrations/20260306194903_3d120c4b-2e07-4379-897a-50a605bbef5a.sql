
-- ============================================================
-- FIX: Replace saldo_usd with saldo_atual in all views
-- saldo_atual is the SINGLE SOURCE OF TRUTH for all currencies
-- ============================================================

-- 1. v_painel_operacional
CREATE OR REPLACE VIEW public.v_painel_operacional AS
SELECT b.id AS entidade_id,
    b.user_id,
    'BOOKMAKER_SAQUE'::text AS tipo_alerta,
    'BOOKMAKER'::text AS entidade_tipo,
    b.nome AS titulo,
    'Pendente de processamento - aguarda registro no Caixa'::text AS descricao,
    b.saldo_atual::numeric(15,2) AS valor,
    b.moeda,
    'MEDIO'::text AS nivel_urgencia,
    2 AS ordem_urgencia,
    NULL::date AS data_limite,
    b.created_at,
    b.parceiro_id,
    ( SELECT p.nome FROM parceiros p WHERE p.id = b.parceiro_id) AS parceiro_nome,
    b.projeto_id,
    ( SELECT pr.nome FROM projetos pr WHERE pr.id = b.projeto_id) AS projeto_nome,
    b.estado_conta AS status_anterior
   FROM bookmakers b
  WHERE b.workspace_id = get_current_workspace() 
    AND b.aguardando_saque_at IS NOT NULL 
    AND NOT EXISTS (
      SELECT 1 FROM cash_ledger cl
      WHERE cl.origem_bookmaker_id = b.id 
        AND cl.tipo_transacao = 'SAQUE'
        AND cl.status = 'PENDENTE'
    )
    AND b.saldo_atual > 0.5
UNION ALL
 SELECT b.id AS entidade_id,
    b.user_id,
    'BOOKMAKER_LIMITADA'::text AS tipo_alerta,
    'BOOKMAKER'::text AS entidade_tipo,
    b.nome AS titulo,
    'Casa limitada - necessário sacar saldo ou realocar'::text AS descricao,
    b.saldo_atual::numeric(15,2) AS valor,
    b.moeda,
    CASE WHEN b.saldo_atual > 1000 THEN 'ALTO' ELSE 'MEDIO' END AS nivel_urgencia,
    CASE WHEN b.saldo_atual > 1000 THEN 1 ELSE 2 END AS ordem_urgencia,
    NULL::date AS data_limite,
    b.created_at,
    b.parceiro_id,
    ( SELECT p.nome FROM parceiros p WHERE p.id = b.parceiro_id) AS parceiro_nome,
    b.projeto_id,
    ( SELECT pr.nome FROM projetos pr WHERE pr.id = b.projeto_id) AS projeto_nome,
    b.estado_conta AS status_anterior
   FROM bookmakers b
  WHERE b.workspace_id = get_current_workspace() 
    AND (b.estado_conta = 'limitada' OR b.status = 'limitada')
    AND b.aguardando_saque_at IS NULL 
    AND NOT EXISTS (
      SELECT 1 FROM cash_ledger cl
      WHERE cl.origem_bookmaker_id = b.id 
        AND cl.tipo_transacao = 'SAQUE'
        AND cl.status = 'PENDENTE'
    )
    AND b.saldo_atual > 0.5;

-- 2. v_bookmakers_aguardando_saque
CREATE OR REPLACE VIEW public.v_bookmakers_aguardando_saque AS
SELECT b.id AS bookmaker_id,
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
    COALESCE(b.saldo_atual, 0) AS saldo_efetivo
   FROM bookmakers b
     LEFT JOIN parceiros pa ON b.parceiro_id = pa.id
     LEFT JOIN projetos pr ON b.projeto_id = pr.id
  WHERE b.aguardando_saque_at IS NOT NULL 
    AND NOT EXISTS (
      SELECT 1 FROM cash_ledger cl
      WHERE cl.origem_bookmaker_id = b.id 
        AND cl.tipo_transacao = 'SAQUE'
        AND cl.status = 'PENDENTE'
    )
    AND b.saldo_atual > 0.5;

-- 3. v_bookmakers_desvinculados
CREATE OR REPLACE VIEW public.v_bookmakers_desvinculados AS
SELECT b.id,
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
    AND b.status IN ('ATIVO', 'AGUARDANDO_DECISAO')
    AND (b.saldo_atual > 0 OR b.saldo_freebet > 0)
    AND ack.id IS NULL 
    AND b.workspace_id = get_current_workspace();
