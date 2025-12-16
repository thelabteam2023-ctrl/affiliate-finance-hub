-- Recriar view v_projeto_resumo com cálculo de lucro baseado em lucro_prejuizo das apostas
DROP VIEW IF EXISTS v_projeto_resumo;

CREATE VIEW v_projeto_resumo AS
SELECT 
    p.id AS projeto_id,
    p.user_id,
    p.nome,
    p.descricao,
    p.status,
    p.data_inicio,
    p.data_fim_prevista,
    p.data_fim_real,
    p.orcamento_inicial,
    p.conciliado,
    p.tem_investimento_crypto,
    -- Operadores ativos
    COALESCE((
        SELECT COUNT(*)
        FROM operador_projetos op
        WHERE op.projeto_id = p.id AND op.status = 'ATIVO'
    ), 0) AS operadores_ativos,
    -- Total gasto com operadores
    COALESCE((
        SELECT SUM(pg.valor)
        FROM pagamentos_operador pg
        WHERE pg.projeto_id = p.id AND pg.status = 'CONFIRMADO'
    ), 0) AS total_gasto_operadores,
    -- Saldo bookmakers
    COALESCE((
        SELECT SUM(b.saldo_atual)
        FROM bookmakers b
        WHERE b.projeto_id = p.id
    ), 0) AS saldo_bookmakers,
    -- Saldo irrecuperável
    COALESCE((
        SELECT SUM(b.saldo_irrecuperavel)
        FROM bookmakers b
        WHERE b.projeto_id = p.id
    ), 0) AS saldo_irrecuperavel,
    -- Total depositado
    COALESCE((
        SELECT SUM(cl.valor)
        FROM cash_ledger cl
        JOIN bookmakers b ON cl.destino_bookmaker_id = b.id
        WHERE b.projeto_id = p.id 
          AND cl.tipo_transacao = 'DEPOSITO' 
          AND cl.status = 'CONFIRMADO'
    ), 0) AS total_depositado,
    -- Total sacado
    COALESCE((
        SELECT SUM(cl.valor)
        FROM cash_ledger cl
        JOIN bookmakers b ON cl.origem_bookmaker_id = b.id
        WHERE b.projeto_id = p.id 
          AND cl.tipo_transacao = 'SAQUE' 
          AND cl.status = 'CONFIRMADO'
    ), 0) AS total_sacado,
    -- Total bookmakers
    COALESCE((
        SELECT COUNT(*)
        FROM bookmakers b
        WHERE b.projeto_id = p.id
    ), 0) AS total_bookmakers,
    -- Perdas confirmadas (da tabela projeto_perdas)
    COALESCE((
        SELECT SUM(pp.valor)
        FROM projeto_perdas pp
        WHERE pp.projeto_id = p.id AND pp.status = 'CONFIRMADA'
    ), 0) AS perdas_confirmadas,
    -- LUCRO OPERACIONAL: soma de lucro_prejuizo das apostas LIQUIDADAS
    -- Apostas simples (excluindo pernas de surebet)
    COALESCE((
        SELECT SUM(a.lucro_prejuizo)
        FROM apostas a
        WHERE a.projeto_id = p.id 
          AND a.status = 'LIQUIDADA'
          AND a.surebet_id IS NULL
    ), 0) 
    -- Apostas múltiplas
    + COALESCE((
        SELECT SUM(am.lucro_prejuizo)
        FROM apostas_multiplas am
        WHERE am.projeto_id = p.id 
          AND am.status = 'LIQUIDADA'
    ), 0)
    -- Surebets
    + COALESCE((
        SELECT SUM(s.lucro_real)
        FROM surebets s
        WHERE s.projeto_id = p.id 
          AND s.status = 'LIQUIDADA'
    ), 0)
    -- Matched betting rounds
    + COALESCE((
        SELECT SUM(mbr.lucro_real)
        FROM matched_betting_rounds mbr
        WHERE mbr.projeto_id = p.id 
          AND mbr.status = 'LIQUIDADO'
    ), 0) AS lucro_operacional
FROM projetos p
WHERE p.user_id = auth.uid();