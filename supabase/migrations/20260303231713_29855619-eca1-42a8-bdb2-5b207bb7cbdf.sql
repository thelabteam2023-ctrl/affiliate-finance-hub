
-- View: v_bookmaker_resultado_financeiro
-- Calcula o RESULTADO FINANCEIRO REAL de cada bookmaker
-- Fórmula: Saques Confirmados + Saldo Atual - Depósitos Confirmados
-- NÃO mistura bônus com fluxo de caixa

CREATE OR REPLACE VIEW public.v_bookmaker_resultado_financeiro AS
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
  -- Depósitos confirmados (apenas tipo_transacao = 'DEPOSITO', status = 'CONFIRMADO')
  COALESCE(dep.total, 0) AS deposito_total,
  -- Saques confirmados (apenas tipo_transacao = 'SAQUE', status = 'CONFIRMADO')
  COALESCE(saq.total, 0) AS saque_total,
  -- RESULTADO FINANCEIRO REAL = Saques + Saldo Atual - Depósitos
  (COALESCE(saq.total, 0) + b.saldo_atual - COALESCE(dep.total, 0)) AS resultado_financeiro_real
FROM public.bookmakers b
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(
    CASE 
      WHEN cl.moeda_destino IS NOT NULL THEN COALESCE(cl.valor_destino, cl.valor)
      ELSE cl.valor
    END
  ), 0) AS total
  FROM public.cash_ledger cl
  WHERE cl.destino_bookmaker_id = b.id
    AND cl.tipo_transacao = 'DEPOSITO'
    AND cl.status = 'CONFIRMADO'
) dep ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(
    CASE 
      WHEN cl.moeda_origem IS NOT NULL THEN COALESCE(cl.valor_origem, cl.valor)
      ELSE cl.valor
    END
  ), 0) AS total
  FROM public.cash_ledger cl
  WHERE cl.origem_bookmaker_id = b.id
    AND cl.tipo_transacao = 'SAQUE'
    AND cl.status = 'CONFIRMADO'
) saq ON true;
