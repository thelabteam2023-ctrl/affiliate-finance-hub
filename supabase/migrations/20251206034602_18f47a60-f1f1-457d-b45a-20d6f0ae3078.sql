
-- Drop and recreate v_projeto_resumo view to add new columns
DROP VIEW IF EXISTS v_projeto_resumo;

CREATE VIEW v_projeto_resumo AS
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
    COALESCE((
        SELECT count(*) 
        FROM operador_projetos op 
        WHERE op.projeto_id = p.id AND op.status = 'ATIVO'
    ), 0) AS operadores_ativos,
    COALESCE((
        SELECT sum(pg.valor) 
        FROM pagamentos_operador pg 
        WHERE pg.projeto_id = p.id AND pg.status = 'CONFIRMADO'
    ), 0) AS total_gasto_operadores,
    COALESCE((
        SELECT sum(b.saldo_atual) 
        FROM bookmakers b 
        WHERE b.projeto_id = p.id
    ), 0) AS saldo_bookmakers,
    COALESCE((
        SELECT sum(b.saldo_irrecuperavel) 
        FROM bookmakers b 
        WHERE b.projeto_id = p.id
    ), 0) AS saldo_irrecuperavel,
    COALESCE((
        SELECT sum(cl.valor) 
        FROM cash_ledger cl 
        JOIN bookmakers b ON cl.destino_bookmaker_id = b.id 
        WHERE b.projeto_id = p.id AND cl.tipo_transacao = 'DEPOSITO' AND cl.status = 'CONFIRMADO'
    ), 0) AS total_depositado,
    COALESCE((
        SELECT sum(cl.valor) 
        FROM cash_ledger cl 
        JOIN bookmakers b ON cl.origem_bookmaker_id = b.id 
        WHERE b.projeto_id = p.id AND cl.tipo_transacao = 'SAQUE' AND cl.status = 'CONFIRMADO'
    ), 0) AS total_sacado,
    COALESCE((
        SELECT count(*) 
        FROM bookmakers b 
        WHERE b.projeto_id = p.id
    ), 0) AS total_bookmakers,
    COALESCE((
        SELECT sum(pc.perdas_confirmadas) 
        FROM projeto_conciliacoes pc 
        WHERE pc.projeto_id = p.id
    ), 0) AS perdas_confirmadas
FROM projetos p
WHERE user_id = auth.uid();
