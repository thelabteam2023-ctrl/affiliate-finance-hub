-- Fix security definer views by explicitly setting them as SECURITY INVOKER
-- This ensures views respect the calling user's RLS policies

-- Recreate view for operational cash balance (FIAT) with SECURITY INVOKER
CREATE OR REPLACE VIEW public.v_saldo_caixa_fiat 
WITH (security_invoker = true) AS
SELECT 
  user_id,
  moeda,
  SUM(CASE 
    WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN valor
    WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -valor
    ELSE 0
  END) as saldo
FROM public.cash_ledger
WHERE tipo_moeda = 'FIAT' 
  AND status = 'CONFIRMADO'
GROUP BY user_id, moeda;

-- Recreate view for operational cash balance (CRYPTO) with SECURITY INVOKER
CREATE OR REPLACE VIEW public.v_saldo_caixa_crypto
WITH (security_invoker = true) AS
SELECT 
  user_id,
  coin,
  SUM(CASE 
    WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN qtd_coin
    WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -qtd_coin
    ELSE 0
  END) as saldo_coin,
  SUM(CASE 
    WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN valor_usd
    WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -valor_usd
    ELSE 0
  END) as saldo_usd
FROM public.cash_ledger
WHERE tipo_moeda = 'CRYPTO' 
  AND status = 'CONFIRMADO'
GROUP BY user_id, coin;

-- Recreate view for partner bank account balances with SECURITY INVOKER
CREATE OR REPLACE VIEW public.v_saldo_parceiro_contas
WITH (security_invoker = true) AS
SELECT 
  cl.user_id,
  p.id as parceiro_id,
  p.nome as parceiro_nome,
  cb.id as conta_id,
  cb.banco as banco,
  cb.titular,
  cl.moeda,
  SUM(CASE 
    WHEN cl.destino_conta_bancaria_id = cb.id THEN cl.valor
    WHEN cl.origem_conta_bancaria_id = cb.id THEN -cl.valor
    ELSE 0
  END) as saldo
FROM public.cash_ledger cl
INNER JOIN public.contas_bancarias cb ON (
  cl.destino_conta_bancaria_id = cb.id OR 
  cl.origem_conta_bancaria_id = cb.id
)
INNER JOIN public.parceiros p ON cb.parceiro_id = p.id
WHERE cl.tipo_moeda = 'FIAT' 
  AND cl.status = 'CONFIRMADO'
GROUP BY cl.user_id, p.id, p.nome, cb.id, cb.banco, cb.titular, cl.moeda;

-- Recreate view for partner crypto wallet balances with SECURITY INVOKER
CREATE OR REPLACE VIEW public.v_saldo_parceiro_wallets
WITH (security_invoker = true) AS
SELECT 
  cl.user_id,
  p.id as parceiro_id,
  p.nome as parceiro_nome,
  w.id as wallet_id,
  w.exchange,
  w.endereco,
  cl.coin,
  SUM(CASE 
    WHEN cl.destino_wallet_id = w.id THEN cl.qtd_coin
    WHEN cl.origem_wallet_id = w.id THEN -cl.qtd_coin
    ELSE 0
  END) as saldo_coin,
  SUM(CASE 
    WHEN cl.destino_wallet_id = w.id THEN cl.valor_usd
    WHEN cl.origem_wallet_id = w.id THEN -cl.valor_usd
    ELSE 0
  END) as saldo_usd
FROM public.cash_ledger cl
INNER JOIN public.wallets_crypto w ON (
  cl.destino_wallet_id = w.id OR 
  cl.origem_wallet_id = w.id
)
INNER JOIN public.parceiros p ON w.parceiro_id = p.id
WHERE cl.tipo_moeda = 'CRYPTO' 
  AND cl.status = 'CONFIRMADO'
GROUP BY cl.user_id, p.id, p.nome, w.id, w.exchange, w.endereco, cl.coin;