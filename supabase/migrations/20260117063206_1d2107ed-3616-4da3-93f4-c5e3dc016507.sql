-- Fix v_saldo_caixa_crypto to only return coin, saldo_coin, saldo_usd (not workspace_id/user_id)
-- while still filtering by current workspace

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
      WHEN cl.destino_tipo = 'CAIXA_OPERACIONAL' THEN cl.qtd_coin
      WHEN cl.origem_tipo = 'CAIXA_OPERACIONAL' THEN -cl.qtd_coin
      ELSE 0
    END
  ), 0) as saldo_usd
FROM cash_ledger cl
WHERE cl.tipo_moeda = 'CRYPTO' 
  AND cl.status = 'CONFIRMADO'
  AND cl.coin IS NOT NULL
  AND cl.workspace_id = public.get_current_workspace()
GROUP BY cl.coin;