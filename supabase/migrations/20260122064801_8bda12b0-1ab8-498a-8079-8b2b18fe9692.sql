
-- View: v_roi_investidores_multimoeda
-- Suporte completo às 8 moedas FIAT do sistema + Crypto consolidado em USD
-- Retorna aportes e liquidações por moeda nativa para cada investidor

DROP VIEW IF EXISTS public.v_roi_investidores_multimoeda;

CREATE VIEW public.v_roi_investidores_multimoeda AS
WITH transacoes_por_moeda AS (
  SELECT 
    cl.investidor_id,
    cl.moeda,
    cl.tipo_moeda,
    -- Aportes (investidor é origem)
    SUM(CASE 
      WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
        AND cl.origem_tipo = 'INVESTIDOR' 
        AND cl.status = 'CONFIRMADO' 
      THEN cl.valor ELSE 0 END
    ) AS aportes,
    -- Liquidações (investidor é destino)
    SUM(CASE 
      WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
        AND cl.destino_tipo = 'INVESTIDOR' 
        AND cl.status = 'CONFIRMADO' 
      THEN cl.valor ELSE 0 END
    ) AS liquidacoes,
    -- USD Reference para cálculo de ROI consolidado
    SUM(CASE 
      WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
        AND cl.origem_tipo = 'INVESTIDOR' 
        AND cl.status = 'CONFIRMADO' 
      THEN COALESCE(cl.valor_usd_referencia, cl.valor_usd, 0) ELSE 0 END
    ) AS aportes_usd_ref,
    SUM(CASE 
      WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
        AND cl.destino_tipo = 'INVESTIDOR' 
        AND cl.status = 'CONFIRMADO' 
      THEN COALESCE(cl.valor_usd_referencia, cl.valor_usd, 0) ELSE 0 END
    ) AS liquidacoes_usd_ref
  FROM cash_ledger cl
  WHERE cl.investidor_id IS NOT NULL
    AND cl.workspace_id = get_current_workspace()
  GROUP BY cl.investidor_id, cl.moeda, cl.tipo_moeda
)
SELECT 
  i.id AS investidor_id,
  i.user_id,
  i.workspace_id,
  i.nome,
  i.cpf,
  i.status,
  -- FIAT por moeda nativa
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'BRL' THEN t.aportes END), 0) AS aportes_brl,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'BRL' THEN t.liquidacoes END), 0) AS liquidacoes_brl,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'USD' THEN t.aportes END), 0) AS aportes_usd,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'USD' THEN t.liquidacoes END), 0) AS liquidacoes_usd,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'EUR' THEN t.aportes END), 0) AS aportes_eur,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'EUR' THEN t.liquidacoes END), 0) AS liquidacoes_eur,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'GBP' THEN t.aportes END), 0) AS aportes_gbp,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'GBP' THEN t.liquidacoes END), 0) AS liquidacoes_gbp,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'MXN' THEN t.aportes END), 0) AS aportes_mxn,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'MXN' THEN t.liquidacoes END), 0) AS liquidacoes_mxn,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'MYR' THEN t.aportes END), 0) AS aportes_myr,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'MYR' THEN t.liquidacoes END), 0) AS liquidacoes_myr,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'ARS' THEN t.aportes END), 0) AS aportes_ars,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'ARS' THEN t.liquidacoes END), 0) AS liquidacoes_ars,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'COP' THEN t.aportes END), 0) AS aportes_cop,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'FIAT' AND t.moeda = 'COP' THEN t.liquidacoes END), 0) AS liquidacoes_cop,
  -- Crypto consolidado em USD
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'CRYPTO' THEN t.aportes END), 0) AS aportes_crypto_usd,
  COALESCE(SUM(CASE WHEN t.tipo_moeda = 'CRYPTO' THEN t.liquidacoes END), 0) AS liquidacoes_crypto_usd,
  -- Totais USD reference para ROI
  COALESCE(SUM(t.aportes_usd_ref), 0) AS total_aportes_usd_ref,
  COALESCE(SUM(t.liquidacoes_usd_ref), 0) AS total_liquidacoes_usd_ref
FROM investidores i
LEFT JOIN transacoes_por_moeda t ON t.investidor_id = i.id
WHERE i.workspace_id = get_current_workspace()
GROUP BY i.id, i.user_id, i.workspace_id, i.nome, i.cpf, i.status;

-- Comentário para documentação
COMMENT ON VIEW public.v_roi_investidores_multimoeda IS 
'View multi-moeda para Gestão de Investidores. Suporta 8 moedas FIAT (BRL, USD, EUR, GBP, MXN, MYR, ARS, COP) + Crypto consolidado em USD. Usado para exibir exposição por moeda nativa com breakdown via NativeCurrencyKpi.';
