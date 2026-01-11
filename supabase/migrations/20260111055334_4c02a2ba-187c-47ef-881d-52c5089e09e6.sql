-- Dropar e recriar view com novos campos
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
    b.parceiro_id,
    pa.nome AS parceiro_nome,
    b.projeto_id,
    pr.nome AS projeto_nome,
    b.updated_at AS data_liberacao,
    -- Saldo efetivo baseado na moeda
    CASE
        WHEN b.moeda IN ('USD', 'USDT') THEN COALESCE(b.saldo_usd, 0)
        ELSE COALESCE(b.saldo_atual, 0)
    END AS saldo_efetivo
FROM bookmakers b
LEFT JOIN parceiros pa ON b.parceiro_id = pa.id
LEFT JOIN projetos pr ON b.projeto_id = pr.id
WHERE b.status = 'AGUARDANDO_SAQUE';