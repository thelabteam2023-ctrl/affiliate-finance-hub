-- Adicionar status AGUARDANDO_DECISAO para casas desvinculadas que precisam de decisão do responsável
-- A view v_bookmakers_desvinculados será atualizada para mostrar casas com este status

-- Recriar a view v_bookmakers_desvinculados para incluir casas com status AGUARDANDO_DECISAO
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
    CASE
        WHEN b.moeda = ANY (ARRAY['USD'::text, 'USDT'::text]) THEN b.saldo_usd
        ELSE b.saldo_atual
    END AS saldo_efetivo,
    COALESCE(b.saldo_atual, 0::numeric) + COALESCE(b.saldo_usd, 0::numeric) + COALESCE(b.saldo_freebet, 0::numeric) AS saldo_total
FROM bookmakers b
LEFT JOIN parceiros p ON b.parceiro_id = p.id
LEFT JOIN bookmaker_unlinked_acks ack ON ack.bookmaker_id = b.id AND ack.workspace_id = b.workspace_id
WHERE b.projeto_id IS NULL 
  AND b.status IN ('ATIVO', 'AGUARDANDO_DECISAO')  -- Incluir novo status
  AND (b.saldo_atual > 0 OR b.saldo_usd > 0 OR b.saldo_freebet > 0) 
  AND ack.id IS NULL 
  AND b.workspace_id = get_current_workspace();