-- Corrigir v_saldo_caixa_crypto para filtrar por workspace igual à v_saldo_caixa_fiat
DROP VIEW IF EXISTS public.v_saldo_caixa_crypto;

CREATE VIEW public.v_saldo_caixa_crypto 
WITH (security_invoker = true) AS
SELECT 
  coin,
  -- Saldo em coins (quantidade real de crypto)
  COALESCE(SUM(
    CASE 
      WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN qtd_coin
      WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -qtd_coin
      ELSE 0
    END
  ), 0) as saldo_coin,
  -- Saldo em USD (para stablecoins como USDT, 1 coin = 1 USD)
  COALESCE(SUM(
    CASE 
      WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN qtd_coin
      WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -qtd_coin
      ELSE 0
    END
  ), 0) as saldo_usd
FROM cash_ledger
WHERE tipo_moeda = 'CRYPTO' 
  AND status = 'CONFIRMADO'
  AND coin IS NOT NULL
  AND impacta_caixa_operacional = true
  AND workspace_id = get_current_workspace()
GROUP BY coin;