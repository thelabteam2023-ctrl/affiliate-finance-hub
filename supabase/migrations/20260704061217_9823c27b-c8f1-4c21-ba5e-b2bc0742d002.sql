
DROP VIEW IF EXISTS public.v_snapshot_anomalias;

CREATE VIEW public.v_snapshot_anomalias AS
SELECT 
  id,
  tipo_transacao,
  tipo_moeda,
  moeda,
  moeda_origem,
  valor,
  valor_confirmado,
  valor_usd,
  valor_usd_referencia,
  cotacao_origem_usd,
  origem_tipo,
  destino_tipo,
  workspace_id,
  data_transacao,
  created_at,
  status,
  transit_status,
  descricao
FROM public.cash_ledger
WHERE moeda NOT IN ('USD','USDT','USDC')
  AND valor IS NOT NULL
  AND valor <> 0
  AND valor_usd_referencia = valor
  AND cotacao_origem_usd = 1
  AND COALESCE(status, '') <> 'CANCELADO'
  AND COALESCE(transit_status, '') <> 'FAILED';

GRANT SELECT ON public.v_snapshot_anomalias TO authenticated;
GRANT ALL ON public.v_snapshot_anomalias TO service_role;

COMMENT ON VIEW public.v_snapshot_anomalias IS
  'Observabilidade contínua de snapshots com cotação 1:1 indevida em moedas não-stable. Exclui transações CANCELADO/FAILED (inócuas). Deve permanecer vazia após backfill de 04/07/2026.';
