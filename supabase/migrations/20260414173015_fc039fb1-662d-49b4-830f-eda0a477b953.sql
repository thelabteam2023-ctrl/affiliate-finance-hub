CREATE OR REPLACE VIEW v_painel_operacional AS
SELECT b.id AS entidade_id,
    b.user_id,
    'BOOKMAKER_SAQUE'::text AS tipo_alerta,
    'BOOKMAKER'::text AS entidade_tipo,
    b.nome AS titulo,
    'Pendente de processamento - aguarda registro no Caixa'::text AS descricao,
    b.saldo_atual AS valor,
    b.moeda,
    'MEDIO'::text AS nivel_urgencia,
    2 AS ordem_urgencia,
    NULL::date AS data_limite,
    b.created_at,
    b.parceiro_id,
    ( SELECT p.nome FROM parceiros p WHERE p.id = b.parceiro_id) AS parceiro_nome,
    b.projeto_id,
    ( SELECT pr.nome FROM projetos pr WHERE pr.id = b.projeto_id) AS projeto_nome,
    b.estado_conta AS status_anterior,
    bc.logo_url AS bookmaker_logo_url
   FROM bookmakers b
   LEFT JOIN bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
  WHERE b.workspace_id = get_current_workspace() AND b.aguardando_saque_at IS NOT NULL AND NOT (EXISTS ( SELECT 1
           FROM cash_ledger cl
          WHERE cl.origem_bookmaker_id = b.id AND cl.tipo_transacao = 'SAQUE'::text AND cl.status = 'PENDENTE'::text)) AND b.saldo_atual > 0.5
UNION ALL
 SELECT b.id AS entidade_id,
    b.user_id,
    'BOOKMAKER_LIMITADA'::text AS tipo_alerta,
    'BOOKMAKER'::text AS entidade_tipo,
    b.nome AS titulo,
    'Casa limitada - necessário sacar saldo ou realocar'::text AS descricao,
    b.saldo_atual AS valor,
    b.moeda,
        CASE
            WHEN b.saldo_atual > 1000::numeric THEN 'ALTO'::text
            ELSE 'MEDIO'::text
        END AS nivel_urgencia,
        CASE
            WHEN b.saldo_atual > 1000::numeric THEN 1
            ELSE 2
        END AS ordem_urgencia,
    NULL::date AS data_limite,
    b.created_at,
    b.parceiro_id,
    ( SELECT p.nome FROM parceiros p WHERE p.id = b.parceiro_id) AS parceiro_nome,
    b.projeto_id,
    ( SELECT pr.nome FROM projetos pr WHERE pr.id = b.projeto_id) AS projeto_nome,
    b.estado_conta AS status_anterior,
    bc.logo_url AS bookmaker_logo_url
   FROM bookmakers b
   LEFT JOIN bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
  WHERE b.workspace_id = get_current_workspace() AND (b.estado_conta = 'limitada'::text OR b.status = 'limitada'::text) AND b.aguardando_saque_at IS NULL AND NOT (EXISTS ( SELECT 1
           FROM cash_ledger cl
          WHERE cl.origem_bookmaker_id = b.id AND cl.tipo_transacao = 'SAQUE'::text AND cl.status = 'PENDENTE'::text)) AND b.saldo_atual > 0.5;