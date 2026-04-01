
-- Fix v_bookmakers_aguardando_saque: remove saldo > 0.5 filter to show zero-balance accounts awaiting withdrawal
CREATE OR REPLACE VIEW v_bookmakers_aguardando_saque AS
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
  );

-- Fix v_bookmakers_desvinculados: include zero-balance accounts that have aguardando_saque_at
-- so they appear in "Bookmakers Disponíveis" after saque is complete
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
  COALESCE(b.saldo_atual, 0) AS saldo_efetivo,
  COALESCE(b.saldo_atual, 0) + COALESCE(b.saldo_freebet, 0) AS saldo_total
FROM bookmakers b
LEFT JOIN parceiros p ON b.parceiro_id = p.id
LEFT JOIN bookmaker_unlinked_acks ack ON ack.bookmaker_id = b.id AND ack.workspace_id = b.workspace_id
WHERE b.projeto_id IS NULL
  AND upper(b.status) = ANY(ARRAY['ATIVO', 'AGUARDANDO_DECISAO', 'LIMITADA'])
  AND b.aguardando_saque_at IS NULL
  AND ack.id IS NULL
  AND b.workspace_id = get_current_workspace();
