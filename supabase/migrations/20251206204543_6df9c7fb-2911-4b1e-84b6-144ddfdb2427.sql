-- O saldo_disponivel será calculado dinamicamente como:
-- saldo_disponivel = saldo_atual - SUM(stake das apostas pendentes)
-- Não precisa criar coluna adicional, apenas criar uma view para facilitar

-- View para calcular saldo disponível por bookmaker (considerando apostas pendentes)
CREATE OR REPLACE VIEW v_bookmaker_saldo_disponivel AS
SELECT 
  b.id,
  b.nome,
  b.parceiro_id,
  b.projeto_id,
  b.saldo_atual AS saldo_total,
  b.moeda,
  b.status,
  COALESCE(
    b.saldo_atual - SUM(CASE WHEN a.status = 'PENDENTE' THEN a.stake ELSE 0 END),
    b.saldo_atual
  ) AS saldo_disponivel,
  COUNT(CASE WHEN a.status = 'PENDENTE' THEN 1 END) AS apostas_pendentes,
  COALESCE(SUM(CASE WHEN a.status = 'PENDENTE' THEN a.stake ELSE 0 END), 0) AS stake_bloqueada
FROM bookmakers b
LEFT JOIN apostas a ON a.bookmaker_id = b.id
WHERE b.user_id = auth.uid()
GROUP BY b.id, b.nome, b.parceiro_id, b.projeto_id, b.saldo_atual, b.moeda, b.status;