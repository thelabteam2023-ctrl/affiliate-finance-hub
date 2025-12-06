-- Drop existing view to recreate with expanded financial metrics
DROP VIEW IF EXISTS v_projeto_resumo;

-- Create comprehensive project financial summary view
CREATE OR REPLACE VIEW v_projeto_resumo AS
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
    -- Saldo atual em bookmakers do projeto
    COALESCE((
        SELECT SUM(b.saldo_atual) 
        FROM bookmakers b 
        WHERE b.projeto_id = p.id
    ), 0) AS saldo_bookmakers,
    -- Total depositado nos bookmakers do projeto
    COALESCE((
        SELECT SUM(cl.valor) 
        FROM cash_ledger cl 
        INNER JOIN bookmakers b ON cl.destino_bookmaker_id = b.id 
        WHERE b.projeto_id = p.id 
          AND cl.tipo_transacao = 'DEPOSITO' 
          AND cl.status = 'CONFIRMADO'
    ), 0) AS total_depositado,
    -- Total sacado dos bookmakers do projeto
    COALESCE((
        SELECT SUM(cl.valor) 
        FROM cash_ledger cl 
        INNER JOIN bookmakers b ON cl.origem_bookmaker_id = b.id 
        WHERE b.projeto_id = p.id 
          AND cl.tipo_transacao = 'SAQUE' 
          AND cl.status = 'CONFIRMADO'
    ), 0) AS total_sacado,
    -- Bookmakers vinculados ao projeto
    COALESCE((
        SELECT COUNT(*) 
        FROM bookmakers b 
        WHERE b.projeto_id = p.id
    ), 0) AS total_bookmakers
FROM projetos p
WHERE p.user_id = auth.uid();