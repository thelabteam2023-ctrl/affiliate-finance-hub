-- Corrigir v_saldo_caixa_fiat usando CAIXA_OPERACIONAL
DROP VIEW IF EXISTS public.v_saldo_caixa_fiat;
CREATE VIEW public.v_saldo_caixa_fiat AS
SELECT 
  user_id,
  moeda,
  COALESCE(SUM(
    CASE 
      WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN valor
      WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -valor
      ELSE 0 
    END
  ), 0) as saldo
FROM public.cash_ledger
WHERE tipo_moeda = 'FIAT' 
  AND status = 'CONFIRMADO'
  AND user_id = auth.uid()
GROUP BY user_id, moeda;

-- Corrigir v_saldo_caixa_crypto usando CAIXA_OPERACIONAL
DROP VIEW IF EXISTS public.v_saldo_caixa_crypto;
CREATE VIEW public.v_saldo_caixa_crypto AS
SELECT 
  user_id,
  coin,
  COALESCE(SUM(
    CASE 
      WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN qtd_coin
      WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -qtd_coin
      ELSE 0 
    END
  ), 0) as saldo_coin,
  COALESCE(SUM(
    CASE 
      WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN valor_usd
      WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -valor_usd
      ELSE 0 
    END
  ), 0) as saldo_usd
FROM public.cash_ledger
WHERE tipo_moeda = 'CRYPTO' 
  AND status = 'CONFIRMADO'
  AND user_id = auth.uid()
GROUP BY user_id, coin;

-- Re-aplicar SECURITY INVOKER
ALTER VIEW public.v_saldo_caixa_fiat SET (security_invoker = on);
ALTER VIEW public.v_saldo_caixa_crypto SET (security_invoker = on);