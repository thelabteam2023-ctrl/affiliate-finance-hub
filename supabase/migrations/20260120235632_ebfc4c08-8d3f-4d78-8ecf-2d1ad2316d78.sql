-- Recriar views de saldo do caixa com security_invoker para respeitar RLS

-- v_saldo_caixa_fiat
DROP VIEW IF EXISTS v_saldo_caixa_fiat;
CREATE VIEW v_saldo_caixa_fiat WITH (security_invoker = true) AS
SELECT 
  moeda,
  COALESCE(sum(
    CASE
      WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN valor
      WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -valor
      ELSE 0::numeric
    END
  ), 0::numeric) AS saldo
FROM cash_ledger
WHERE tipo_moeda = 'FIAT' 
  AND status = 'CONFIRMADO' 
  AND impacta_caixa_operacional = true 
  AND workspace_id = get_current_workspace()
GROUP BY moeda;

-- v_saldo_caixa_crypto
DROP VIEW IF EXISTS v_saldo_caixa_crypto;
CREATE VIEW v_saldo_caixa_crypto WITH (security_invoker = true) AS
SELECT 
  coin,
  COALESCE(sum(
    CASE
      WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN qtd_coin
      WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -qtd_coin
      ELSE 0::numeric
    END
  ), 0::numeric) AS saldo_coin,
  COALESCE(sum(
    CASE
      WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN COALESCE(valor_usd, qtd_coin * COALESCE(cotacao, 1::numeric))
      WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -COALESCE(valor_usd, qtd_coin * COALESCE(cotacao, 1::numeric))
      ELSE 0::numeric
    END
  ), 0::numeric) AS saldo_usd
FROM cash_ledger cl
WHERE tipo_moeda = 'CRYPTO' 
  AND status = 'CONFIRMADO' 
  AND coin IS NOT NULL 
  AND workspace_id = get_current_workspace()
GROUP BY coin;