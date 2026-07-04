
-- Guardrail: bloqueia snapshot 1:1 indevido em moedas não-stable
ALTER TABLE public.cash_ledger
  ADD CONSTRAINT chk_snapshot_1_para_1_nao_stable
  CHECK (
    NOT (
      moeda NOT IN ('USD','USDT','USDC')
      AND valor IS NOT NULL
      AND valor <> 0
      AND valor_usd_referencia = valor
      AND cotacao_origem_usd = 1
    )
  ) NOT VALID;

-- View de observabilidade contínua
CREATE OR REPLACE VIEW public.v_snapshot_anomalias AS
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
  descricao
FROM public.cash_ledger
WHERE moeda NOT IN ('USD','USDT','USDC')
  AND valor IS NOT NULL
  AND valor <> 0
  AND valor_usd_referencia = valor
  AND cotacao_origem_usd = 1;

GRANT SELECT ON public.v_snapshot_anomalias TO authenticated;
GRANT ALL ON public.v_snapshot_anomalias TO service_role;

COMMENT ON CONSTRAINT chk_snapshot_1_para_1_nao_stable ON public.cash_ledger IS
  'Impede que novos lançamentos gravem valor_usd_referencia=valor e cotacao_origem_usd=1 em moedas não-USD/USDT/USDC. Fix relacionado: CaixaTransacaoDialog.tsx FIAT_SET. NOT VALID: preserva registros históricos legados.';

COMMENT ON VIEW public.v_snapshot_anomalias IS
  'Observabilidade contínua de snapshots com cotação 1:1 indevida em moedas não-stable. Deve permanecer vazia após backfill de 04/07/2026.';
