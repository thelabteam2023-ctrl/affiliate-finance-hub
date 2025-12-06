-- Fix the view to use SECURITY INVOKER instead of default SECURITY DEFINER
DROP VIEW IF EXISTS v_bookmaker_saldo_disponivel;

CREATE VIEW v_bookmaker_saldo_disponivel 
WITH (security_invoker = true) AS
SELECT 
  b.id,
  b.nome,
  b.parceiro_id,
  b.projeto_id,
  b.saldo_atual AS saldo_total,
  b.moeda,
  b.status,
  b.user_id,
  COALESCE(
    b.saldo_atual - SUM(CASE WHEN a.status = 'PENDENTE' THEN a.stake ELSE 0 END),
    b.saldo_atual
  ) AS saldo_disponivel,
  COUNT(CASE WHEN a.status = 'PENDENTE' THEN 1 END)::integer AS apostas_pendentes,
  COALESCE(SUM(CASE WHEN a.status = 'PENDENTE' THEN a.stake ELSE 0 END), 0) AS stake_bloqueada
FROM bookmakers b
LEFT JOIN apostas a ON a.bookmaker_id = b.id
GROUP BY b.id, b.nome, b.parceiro_id, b.projeto_id, b.saldo_atual, b.moeda, b.status, b.user_id;