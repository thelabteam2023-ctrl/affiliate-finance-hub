
-- Corrigir v_saldo_caixa_crypto para calcular saldo_usd usando a cotação
-- saldo_coin = quantidade de moeda (ex: 224.85 USDT)
-- saldo_usd = valor em dólares (ex: 224.85 * 1.0003 = 224.92 USD)

DROP VIEW IF EXISTS public.v_saldo_caixa_crypto;

CREATE OR REPLACE VIEW public.v_saldo_caixa_crypto AS
SELECT 
  cl.coin,
  COALESCE(SUM(
    CASE 
      WHEN cl.destino_tipo = 'CAIXA_OPERACIONAL' THEN cl.qtd_coin
      WHEN cl.origem_tipo = 'CAIXA_OPERACIONAL' THEN -cl.qtd_coin
      ELSE 0
    END
  ), 0) as saldo_coin,
  COALESCE(SUM(
    CASE 
      WHEN cl.destino_tipo = 'CAIXA_OPERACIONAL' THEN COALESCE(cl.valor_usd, cl.qtd_coin * COALESCE(cl.cotacao, 1))
      WHEN cl.origem_tipo = 'CAIXA_OPERACIONAL' THEN -COALESCE(cl.valor_usd, cl.qtd_coin * COALESCE(cl.cotacao, 1))
      ELSE 0
    END
  ), 0) as saldo_usd
FROM cash_ledger cl
WHERE cl.tipo_moeda = 'CRYPTO' 
  AND cl.status = 'CONFIRMADO'
  AND cl.coin IS NOT NULL
  AND cl.workspace_id = public.get_current_workspace()
GROUP BY cl.coin;
