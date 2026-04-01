
-- Recriar view v_bookmaker_resultado_financeiro incluindo transações virtuais
CREATE OR REPLACE VIEW v_bookmaker_resultado_financeiro AS
SELECT 
  b.id AS bookmaker_id,
  b.nome AS bookmaker_nome,
  b.moeda,
  b.workspace_id,
  b.projeto_id,
  b.parceiro_id,
  b.saldo_atual,
  b.saldo_bonus,
  b.saldo_freebet,
  COALESCE(dep.total, 0) AS deposito_total,
  COALESCE(saq.total, 0) AS saque_total,
  COALESCE(saq.total, 0) + b.saldo_atual - COALESCE(dep.total, 0) AS resultado_financeiro_real,
  COALESCE(
    (SELECT count(*) FROM apostas_unificada a WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA'),
    0
  ) + COALESCE(
    (SELECT count(*) FROM apostas_pernas ap WHERE ap.bookmaker_id = b.id AND ap.resultado IS NOT NULL),
    0
  ) AS qtd_apostas
FROM bookmakers b
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(
    CASE
      WHEN cl.moeda_destino IS NOT NULL THEN COALESCE(cl.valor_destino, cl.valor)
      ELSE cl.valor
    END
  ), 0) AS total
  FROM cash_ledger cl
  WHERE cl.destino_bookmaker_id = b.id
    AND cl.tipo_transacao IN ('DEPOSITO', 'DEPOSITO_VIRTUAL')
    AND cl.status = 'CONFIRMADO'
) dep ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(
    CASE
      WHEN cl.moeda_origem IS NOT NULL THEN COALESCE(cl.valor_origem, cl.valor)
      ELSE cl.valor
    END
  ), 0) AS total
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = b.id
    AND cl.tipo_transacao IN ('SAQUE', 'SAQUE_VIRTUAL')
    AND cl.status = 'CONFIRMADO'
) saq ON true;
