-- =====================================================
-- CORRIGIR VIEWS PARA USAR WORKSPACE_ID
-- =====================================================

-- Recriar v_projeto_resumo com filtro por workspace
DROP VIEW IF EXISTS public.v_projeto_resumo CASCADE;

CREATE OR REPLACE VIEW public.v_projeto_resumo AS
SELECT 
    id AS projeto_id,
    user_id,
    nome,
    descricao,
    status,
    data_inicio,
    data_fim_prevista,
    data_fim_real,
    orcamento_inicial,
    conciliado,
    tem_investimento_crypto,
    COALESCE(( SELECT count(*) AS count
           FROM operador_projetos op
          WHERE ((op.projeto_id = p.id) AND (op.status = 'ATIVO'::text))), (0)::bigint) AS operadores_ativos,
    COALESCE(( SELECT sum(pg.valor) AS sum
           FROM pagamentos_operador pg
          WHERE ((pg.projeto_id = p.id) AND (pg.status = 'CONFIRMADO'::text))), (0)::numeric) AS total_gasto_operadores,
    COALESCE(( SELECT sum(b.saldo_atual) AS sum
           FROM bookmakers b
          WHERE (b.projeto_id = p.id)), (0)::numeric) AS saldo_bookmakers,
    COALESCE(( SELECT sum(b.saldo_irrecuperavel) AS sum
           FROM bookmakers b
          WHERE (b.projeto_id = p.id)), (0)::numeric) AS saldo_irrecuperavel,
    COALESCE(( SELECT sum(cl.valor) AS sum
           FROM (cash_ledger cl
             JOIN bookmakers b ON ((cl.destino_bookmaker_id = b.id)))
          WHERE ((b.projeto_id = p.id) AND (cl.tipo_transacao = 'DEPOSITO'::text) AND (cl.status = 'CONFIRMADO'::text))), (0)::numeric) AS total_depositado,
    COALESCE(( SELECT sum(cl.valor) AS sum
           FROM (cash_ledger cl
             JOIN bookmakers b ON ((cl.origem_bookmaker_id = b.id)))
          WHERE ((b.projeto_id = p.id) AND (cl.tipo_transacao = 'SAQUE'::text) AND (cl.status = 'CONFIRMADO'::text))), (0)::numeric) AS total_sacado,
    COALESCE(( SELECT count(*) AS count
           FROM bookmakers b
          WHERE (b.projeto_id = p.id)), (0)::bigint) AS total_bookmakers,
    COALESCE(( SELECT sum(pp.valor) AS sum
           FROM projeto_perdas pp
          WHERE ((pp.projeto_id = p.id) AND (pp.status = 'CONFIRMADA'::text))), (0)::numeric) AS perdas_confirmadas,
    (((COALESCE(( SELECT sum(a.lucro_prejuizo) AS sum
           FROM apostas a
          WHERE ((a.projeto_id = p.id) AND (a.status = 'LIQUIDADA'::text) AND (a.surebet_id IS NULL))), (0)::numeric) + COALESCE(( SELECT sum(am.lucro_prejuizo) AS sum
           FROM apostas_multiplas am
          WHERE ((am.projeto_id = p.id) AND (am.status = 'LIQUIDADA'::text))), (0)::numeric)) + COALESCE(( SELECT sum(s.lucro_real) AS sum
           FROM surebets s
          WHERE ((s.projeto_id = p.id) AND (s.status = 'LIQUIDADA'::text))), (0)::numeric)) + COALESCE(( SELECT sum(mbr.lucro_real) AS sum
           FROM matched_betting_rounds mbr
          WHERE ((mbr.projeto_id = p.id) AND (mbr.status = 'LIQUIDADA'::text))), (0)::numeric)) AS lucro_operacional
FROM projetos p
WHERE workspace_id = get_current_workspace();

-- Recriar v_saldo_caixa_fiat com filtro por workspace
DROP VIEW IF EXISTS public.v_saldo_caixa_fiat CASCADE;

CREATE OR REPLACE VIEW public.v_saldo_caixa_fiat AS
SELECT 
    user_id,
    moeda,
    COALESCE(sum(
        CASE
            WHEN (destino_tipo = 'CAIXA_OPERACIONAL'::text) THEN valor
            WHEN (origem_tipo = 'CAIXA_OPERACIONAL'::text) THEN (- valor)
            ELSE (0)::numeric
        END), (0)::numeric) AS saldo
FROM cash_ledger
WHERE tipo_moeda = 'FIAT'::text 
  AND status = 'CONFIRMADO'::text 
  AND workspace_id = get_current_workspace()
GROUP BY user_id, moeda;

-- Recriar v_saldo_caixa_crypto com filtro por workspace
DROP VIEW IF EXISTS public.v_saldo_caixa_crypto CASCADE;

CREATE OR REPLACE VIEW public.v_saldo_caixa_crypto AS
SELECT 
    user_id,
    coin,
    COALESCE(sum(
        CASE
            WHEN (destino_tipo = 'CAIXA_OPERACIONAL'::text) THEN qtd_coin
            WHEN (origem_tipo = 'CAIXA_OPERACIONAL'::text) THEN (- qtd_coin)
            ELSE (0)::numeric
        END), (0)::numeric) AS saldo_coin,
    COALESCE(sum(
        CASE
            WHEN (destino_tipo = 'CAIXA_OPERACIONAL'::text) THEN valor_usd
            WHEN (origem_tipo = 'CAIXA_OPERACIONAL'::text) THEN (- valor_usd)
            ELSE (0)::numeric
        END), (0)::numeric) AS saldo_usd
FROM cash_ledger
WHERE tipo_moeda = 'CRYPTO'::text 
  AND status = 'CONFIRMADO'::text 
  AND workspace_id = get_current_workspace()
GROUP BY user_id, coin;

-- Recriar v_bookmaker_saldo_disponivel com filtro por workspace
DROP VIEW IF EXISTS public.v_bookmaker_saldo_disponivel CASCADE;

CREATE OR REPLACE VIEW public.v_bookmaker_saldo_disponivel AS
SELECT 
    b.id,
    b.nome,
    b.parceiro_id,
    b.projeto_id,
    b.saldo_atual AS saldo_total,
    b.moeda,
    b.status,
    b.user_id,
    COALESCE((b.saldo_atual - sum(
        CASE
            WHEN (a.status = 'PENDENTE'::text) THEN a.stake
            ELSE (0)::numeric
        END)), b.saldo_atual) AS saldo_disponivel,
    (count(
        CASE
            WHEN (a.status = 'PENDENTE'::text) THEN 1
            ELSE NULL::integer
        END))::integer AS apostas_pendentes,
    COALESCE(sum(
        CASE
            WHEN (a.status = 'PENDENTE'::text) THEN a.stake
            ELSE (0)::numeric
        END), (0)::numeric) AS stake_bloqueada
FROM bookmakers b
LEFT JOIN apostas a ON a.bookmaker_id = b.id
WHERE b.workspace_id = get_current_workspace()
GROUP BY b.id, b.nome, b.parceiro_id, b.projeto_id, b.saldo_atual, b.moeda, b.status, b.user_id;

-- Recriar v_parceiro_lucro_total com filtro por workspace
DROP VIEW IF EXISTS public.v_parceiro_lucro_total CASCADE;

CREATE OR REPLACE VIEW public.v_parceiro_lucro_total AS
SELECT 
    p.id AS parceiro_id,
    p.user_id,
    p.nome,
    p.cpf,
    p.status,
    COALESCE(( 
        SELECT sum(
            CASE 
                WHEN cl.destino_parceiro_id = p.id THEN cl.valor
                WHEN cl.origem_parceiro_id = p.id THEN -cl.valor
                ELSE 0
            END
        ) 
        FROM cash_ledger cl
        WHERE (cl.destino_parceiro_id = p.id OR cl.origem_parceiro_id = p.id)
          AND cl.status = 'CONFIRMADO'
    ), 0) AS lucro_fluxo_caixa,
    COALESCE((
        SELECT sum(b.saldo_atual) 
        FROM bookmakers b 
        WHERE b.parceiro_id = p.id
    ), 0) AS saldo_bookmakers,
    COALESCE((
        SELECT sum(cl.valor) 
        FROM cash_ledger cl
        JOIN bookmakers b ON cl.destino_bookmaker_id = b.id
        WHERE b.parceiro_id = p.id 
          AND cl.tipo_transacao = 'DEPOSITO'
          AND cl.status = 'CONFIRMADO'
    ), 0) AS total_depositado,
    COALESCE((
        SELECT sum(cl.valor) 
        FROM cash_ledger cl
        JOIN bookmakers b ON cl.origem_bookmaker_id = b.id
        WHERE b.parceiro_id = p.id 
          AND cl.tipo_transacao = 'SAQUE'
          AND cl.status = 'CONFIRMADO'
    ), 0) AS total_sacado,
    0::numeric AS lucro_projetos
FROM parceiros p
WHERE p.workspace_id = get_current_workspace();

-- Recriar v_saldo_parceiro_contas com filtro por workspace
DROP VIEW IF EXISTS public.v_saldo_parceiro_contas CASCADE;

CREATE OR REPLACE VIEW public.v_saldo_parceiro_contas AS
SELECT 
    p.user_id,
    p.id AS parceiro_id,
    p.nome AS parceiro_nome,
    cb.id AS conta_id,
    cb.banco,
    'BRL'::text AS moeda,
    COALESCE((
        SELECT sum(
            CASE 
                WHEN cl.destino_conta_bancaria_id = cb.id THEN cl.valor
                WHEN cl.origem_conta_bancaria_id = cb.id THEN -cl.valor
                ELSE 0
            END
        )
        FROM cash_ledger cl
        WHERE (cl.destino_conta_bancaria_id = cb.id OR cl.origem_conta_bancaria_id = cb.id)
          AND cl.status = 'CONFIRMADO'
    ), 0) AS saldo
FROM parceiros p
JOIN contas_bancarias cb ON cb.parceiro_id = p.id
WHERE p.workspace_id = get_current_workspace();

-- Recriar v_saldo_parceiro_wallets com filtro por workspace
DROP VIEW IF EXISTS public.v_saldo_parceiro_wallets CASCADE;

CREATE OR REPLACE VIEW public.v_saldo_parceiro_wallets AS
SELECT 
    p.user_id,
    p.id AS parceiro_id,
    p.nome AS parceiro_nome,
    w.id AS wallet_id,
    w.exchange,
    w.endereco,
    cl_agg.coin,
    COALESCE(cl_agg.saldo_coin, 0) AS saldo_coin,
    COALESCE(cl_agg.saldo_usd, 0) AS saldo_usd
FROM parceiros p
JOIN wallets_crypto w ON w.parceiro_id = p.id
LEFT JOIN LATERAL (
    SELECT 
        cl.coin,
        sum(
            CASE 
                WHEN cl.destino_wallet_id = w.id THEN cl.qtd_coin
                WHEN cl.origem_wallet_id = w.id THEN -cl.qtd_coin
                ELSE 0
            END
        ) AS saldo_coin,
        sum(
            CASE 
                WHEN cl.destino_wallet_id = w.id THEN cl.valor_usd
                WHEN cl.origem_wallet_id = w.id THEN -cl.valor_usd
                ELSE 0
            END
        ) AS saldo_usd
    FROM cash_ledger cl
    WHERE (cl.destino_wallet_id = w.id OR cl.origem_wallet_id = w.id)
      AND cl.status = 'CONFIRMADO'
    GROUP BY cl.coin
) cl_agg ON true
WHERE p.workspace_id = get_current_workspace();

-- Recriar v_painel_operacional com filtro por workspace
DROP VIEW IF EXISTS public.v_painel_operacional CASCADE;

CREATE OR REPLACE VIEW public.v_painel_operacional AS
SELECT 
    b.id AS entidade_id,
    b.user_id,
    'BOOKMAKER_SAQUE'::text AS tipo_alerta,
    'BOOKMAKER'::text AS entidade_tipo,
    b.nome AS titulo,
    'Aguardando confirmação de saque'::text AS descricao,
    b.saldo_atual AS valor,
    b.moeda,
    'MEDIO'::text AS nivel_urgencia,
    2 AS ordem_urgencia,
    NULL::date AS data_limite,
    b.created_at,
    b.parceiro_id,
    (SELECT nome FROM parceiros WHERE id = b.parceiro_id) AS parceiro_nome,
    b.projeto_id,
    (SELECT nome FROM projetos WHERE id = b.projeto_id) AS projeto_nome,
    b.status AS status_anterior
FROM bookmakers b
WHERE b.status = 'AGUARDANDO_SAQUE'
  AND b.workspace_id = get_current_workspace();