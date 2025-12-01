-- Fix SECURITY DEFINER views by adding explicit user_id filters
-- This ensures proper data isolation and prevents RLS bypass

-- Recreate v_roi_investidores with user_id filter
DROP VIEW IF EXISTS public.v_roi_investidores;
CREATE VIEW public.v_roi_investidores AS
SELECT 
  i.id as investidor_id,
  i.user_id,
  i.nome,
  i.cpf,
  i.status,
  COALESCE(SUM(CASE WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' AND cl.origem_tipo = 'INVESTIDOR' THEN cl.valor ELSE 0 END), 0) as total_aportes,
  COALESCE(SUM(CASE WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' AND cl.destino_tipo = 'INVESTIDOR' THEN cl.valor ELSE 0 END), 0) as total_liquidacoes,
  COALESCE(SUM(CASE WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' AND cl.destino_tipo = 'INVESTIDOR' THEN cl.valor ELSE 0 END), 0) - 
  COALESCE(SUM(CASE WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' AND cl.origem_tipo = 'INVESTIDOR' THEN cl.valor ELSE 0 END), 0) as lucro_prejuizo,
  CASE 
    WHEN COALESCE(SUM(CASE WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' AND cl.origem_tipo = 'INVESTIDOR' THEN cl.valor ELSE 0 END), 0) > 0 
    THEN (
      (COALESCE(SUM(CASE WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' AND cl.destino_tipo = 'INVESTIDOR' THEN cl.valor ELSE 0 END), 0) - 
       COALESCE(SUM(CASE WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' AND cl.origem_tipo = 'INVESTIDOR' THEN cl.valor ELSE 0 END), 0)) / 
      COALESCE(SUM(CASE WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' AND cl.origem_tipo = 'INVESTIDOR' THEN cl.valor ELSE 0 END), 1)
    ) * 100
    ELSE 0 
  END as roi_percentual
FROM public.investidores i
LEFT JOIN public.cash_ledger cl ON cl.investidor_id = i.id AND cl.user_id = i.user_id
WHERE i.user_id = auth.uid()
GROUP BY i.id, i.user_id, i.nome, i.cpf, i.status;

-- Recreate v_saldo_caixa_fiat with user_id filter
DROP VIEW IF EXISTS public.v_saldo_caixa_fiat;
CREATE VIEW public.v_saldo_caixa_fiat AS
SELECT 
  user_id,
  moeda,
  COALESCE(SUM(
    CASE 
      WHEN destino_tipo = 'CAIXA' THEN valor
      WHEN origem_tipo = 'CAIXA' THEN -valor
      ELSE 0 
    END
  ), 0) as saldo
FROM public.cash_ledger
WHERE tipo_moeda = 'FIAT' 
  AND status = 'CONFIRMADO'
  AND user_id = auth.uid()
GROUP BY user_id, moeda;

-- Recreate v_saldo_caixa_crypto with user_id filter
DROP VIEW IF EXISTS public.v_saldo_caixa_crypto;
CREATE VIEW public.v_saldo_caixa_crypto AS
SELECT 
  user_id,
  coin,
  COALESCE(SUM(
    CASE 
      WHEN destino_tipo = 'CAIXA' THEN qtd_coin
      WHEN origem_tipo = 'CAIXA' THEN -qtd_coin
      ELSE 0 
    END
  ), 0) as saldo_coin,
  COALESCE(SUM(
    CASE 
      WHEN destino_tipo = 'CAIXA' THEN valor_usd
      WHEN origem_tipo = 'CAIXA' THEN -valor_usd
      ELSE 0 
    END
  ), 0) as saldo_usd
FROM public.cash_ledger
WHERE tipo_moeda = 'CRYPTO' 
  AND status = 'CONFIRMADO'
  AND user_id = auth.uid()
GROUP BY user_id, coin;

-- Recreate v_saldo_parceiro_contas with user_id filter
DROP VIEW IF EXISTS public.v_saldo_parceiro_contas;
CREATE VIEW public.v_saldo_parceiro_contas AS
SELECT 
  p.user_id,
  p.id as parceiro_id,
  p.nome as parceiro_nome,
  cb.id as conta_id,
  cb.banco,
  cb.titular,
  'BRL' as moeda,
  COALESCE(SUM(
    CASE 
      WHEN cl.destino_conta_bancaria_id = cb.id THEN cl.valor
      WHEN cl.origem_conta_bancaria_id = cb.id THEN -cl.valor
      ELSE 0 
    END
  ), 0) as saldo
FROM public.parceiros p
INNER JOIN public.contas_bancarias cb ON cb.parceiro_id = p.id
LEFT JOIN public.cash_ledger cl ON 
  (cl.destino_conta_bancaria_id = cb.id OR cl.origem_conta_bancaria_id = cb.id)
  AND cl.status = 'CONFIRMADO'
  AND cl.user_id = p.user_id
WHERE p.user_id = auth.uid()
GROUP BY p.user_id, p.id, p.nome, cb.id, cb.banco, cb.titular;

-- Recreate v_saldo_parceiro_wallets with user_id filter
DROP VIEW IF EXISTS public.v_saldo_parceiro_wallets;
CREATE VIEW public.v_saldo_parceiro_wallets AS
SELECT 
  p.user_id,
  p.id as parceiro_id,
  p.nome as parceiro_nome,
  wc.id as wallet_id,
  wc.exchange,
  wc.endereco,
  coin_unnest.coin,
  COALESCE(SUM(
    CASE 
      WHEN cl.destino_wallet_id = wc.id AND cl.coin = coin_unnest.coin THEN cl.qtd_coin
      WHEN cl.origem_wallet_id = wc.id AND cl.coin = coin_unnest.coin THEN -cl.qtd_coin
      ELSE 0 
    END
  ), 0) as saldo_coin,
  COALESCE(SUM(
    CASE 
      WHEN cl.destino_wallet_id = wc.id AND cl.coin = coin_unnest.coin THEN cl.valor_usd
      WHEN cl.origem_wallet_id = wc.id AND cl.coin = coin_unnest.coin THEN -cl.valor_usd
      ELSE 0 
    END
  ), 0) as saldo_usd
FROM public.parceiros p
INNER JOIN public.wallets_crypto wc ON wc.parceiro_id = p.id
CROSS JOIN LATERAL UNNEST(wc.moeda) AS coin_unnest(coin)
LEFT JOIN public.cash_ledger cl ON 
  (cl.destino_wallet_id = wc.id OR cl.origem_wallet_id = wc.id)
  AND cl.status = 'CONFIRMADO'
  AND cl.user_id = p.user_id
WHERE p.user_id = auth.uid()
GROUP BY p.user_id, p.id, p.nome, wc.id, wc.exchange, wc.endereco, coin_unnest.coin;