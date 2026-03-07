
-- Fix: v_bookmakers_desvinculados should also show LIMITADA status houses
-- These are houses that were limited and unlinked, potentially with remaining balance
CREATE OR REPLACE VIEW v_bookmakers_desvinculados AS
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
    COALESCE(b.saldo_atual, 0::numeric) AS saldo_efetivo,
    COALESCE(b.saldo_atual, 0::numeric) + COALESCE(b.saldo_freebet, 0::numeric) AS saldo_total
   FROM bookmakers b
     LEFT JOIN parceiros p ON b.parceiro_id = p.id
     LEFT JOIN bookmaker_unlinked_acks ack ON ack.bookmaker_id = b.id AND ack.workspace_id = b.workspace_id
  WHERE b.projeto_id IS NULL 
    AND (upper(b.status) = ANY (ARRAY['ATIVO'::text, 'AGUARDANDO_DECISAO'::text, 'LIMITADA'::text])) 
    AND b.aguardando_saque_at IS NULL 
    AND (b.saldo_atual > 0::numeric OR b.saldo_freebet > 0::numeric) 
    AND ack.id IS NULL 
    AND b.workspace_id = get_current_workspace();
