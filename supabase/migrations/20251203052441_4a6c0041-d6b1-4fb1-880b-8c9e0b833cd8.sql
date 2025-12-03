-- Drop existing view and recreate with separated FIAT/CRYPTO values
DROP VIEW IF EXISTS public.v_roi_investidores;

CREATE VIEW public.v_roi_investidores AS
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
    
  -- Aportes FIAT USD
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.origem_tipo = 'INVESTIDOR' 
    AND cl.tipo_moeda = 'FIAT'
    AND cl.moeda = 'USD'
    AND cl.status = 'CONFIRMADO'
    THEN cl.valor ELSE 0 END), 0) AS aportes_fiat_usd,
    
  -- Aportes CRYPTO (valor_usd no momento do aporte)
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.origem_tipo = 'INVESTIDOR' 
    AND cl.tipo_moeda = 'CRYPTO'
    AND cl.status = 'CONFIRMADO'
    THEN cl.valor_usd ELSE 0 END), 0) AS aportes_crypto_usd,
    
  -- Liquidações FIAT BRL
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.destino_tipo = 'INVESTIDOR' 
    AND cl.tipo_moeda = 'FIAT'
    AND cl.moeda = 'BRL'
    AND cl.status = 'CONFIRMADO'
    THEN cl.valor ELSE 0 END), 0) AS liquidacoes_fiat_brl,
    
  -- Liquidações FIAT USD
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.destino_tipo = 'INVESTIDOR' 
    AND cl.tipo_moeda = 'FIAT'
    AND cl.moeda = 'USD'
    AND cl.status = 'CONFIRMADO'
    THEN cl.valor ELSE 0 END), 0) AS liquidacoes_fiat_usd,
    
  -- Liquidações CRYPTO (valor_usd no momento)
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.destino_tipo = 'INVESTIDOR' 
    AND cl.tipo_moeda = 'CRYPTO'
    AND cl.status = 'CONFIRMADO'
    THEN cl.valor_usd ELSE 0 END), 0) AS liquidacoes_crypto_usd
    
FROM public.investidores i
LEFT JOIN public.cash_ledger cl ON cl.investidor_id = i.id AND cl.user_id = i.user_id
GROUP BY i.id, i.user_id, i.nome, i.cpf, i.status;