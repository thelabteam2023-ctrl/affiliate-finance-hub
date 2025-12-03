-- Fix security: recreate view with SECURITY INVOKER
DROP VIEW IF EXISTS public.v_roi_investidores;

CREATE VIEW public.v_roi_investidores 
WITH (security_invoker = true) AS
SELECT 
  i.id AS investidor_id,
  i.user_id,
  i.nome,
  i.cpf,
  i.status,
  -- Aportes FIAT BRL
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.origem_tipo = 'INVESTIDOR' 
    AND cl.tipo_moeda = 'FIAT'
    AND cl.moeda = 'BRL'
    AND cl.status = 'CONFIRMADO'
    THEN cl.valor ELSE 0 END), 0) AS aportes_fiat_brl,
    
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.origem_tipo = 'INVESTIDOR' 
    AND cl.tipo_moeda = 'FIAT'
    AND cl.moeda = 'USD'
    AND cl.status = 'CONFIRMADO'
    THEN cl.valor ELSE 0 END), 0) AS aportes_fiat_usd,
    
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.origem_tipo = 'INVESTIDOR' 
    AND cl.tipo_moeda = 'CRYPTO'
    AND cl.status = 'CONFIRMADO'
    THEN cl.valor_usd ELSE 0 END), 0) AS aportes_crypto_usd,
    
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.destino_tipo = 'INVESTIDOR' 
    AND cl.tipo_moeda = 'FIAT'
    AND cl.moeda = 'BRL'
    AND cl.status = 'CONFIRMADO'
    THEN cl.valor ELSE 0 END), 0) AS liquidacoes_fiat_brl,
    
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.destino_tipo = 'INVESTIDOR' 
    AND cl.tipo_moeda = 'FIAT'
    AND cl.moeda = 'USD'
    AND cl.status = 'CONFIRMADO'
    THEN cl.valor ELSE 0 END), 0) AS liquidacoes_fiat_usd,
    
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.destino_tipo = 'INVESTIDOR' 
    AND cl.tipo_moeda = 'CRYPTO'
    AND cl.status = 'CONFIRMADO'
    THEN cl.valor_usd ELSE 0 END), 0) AS liquidacoes_crypto_usd
    
FROM public.investidores i
LEFT JOIN public.cash_ledger cl ON cl.investidor_id = i.id AND cl.user_id = i.user_id
WHERE i.user_id = auth.uid()
GROUP BY i.id, i.user_id, i.nome, i.cpf, i.status;