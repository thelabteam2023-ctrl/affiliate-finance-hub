
-- Corrigir v_saldo_caixa_crypto para usar qtd_coin em vez de valor
-- O saldo_usd deve ser igual ao saldo_coin para stablecoins como USDT
-- A conciliação é puramente informativa e não deve afetar o saldo

DROP VIEW IF EXISTS public.v_saldo_caixa_crypto CASCADE;

CREATE OR REPLACE VIEW public.v_saldo_caixa_crypto AS
SELECT 
  cl.workspace_id,
  cl.user_id,
  cl.coin,
  -- Saldo em coins (quantidade real de crypto)
  COALESCE(SUM(
    CASE 
      WHEN cl.destino_tipo = 'CAIXA_OPERACIONAL' THEN cl.qtd_coin
      WHEN cl.origem_tipo = 'CAIXA_OPERACIONAL' THEN -cl.qtd_coin
      ELSE 0
    END
  ), 0) as saldo_coin,
  -- Saldo em USD deve usar qtd_coin (não valor, que pode ter sido decrementado por conciliação)
  -- Para stablecoins como USDT, 1 coin = 1 USD
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
GROUP BY cl.workspace_id, cl.user_id, cl.coin;

-- Adicionar comentário explicativo
COMMENT ON VIEW public.v_saldo_caixa_crypto IS 
'Saldo de crypto no caixa operacional. Usa qtd_coin para ambos saldo_coin e saldo_usd, 
pois a conciliação cambial é puramente informativa e não deve afetar os saldos reais.';
