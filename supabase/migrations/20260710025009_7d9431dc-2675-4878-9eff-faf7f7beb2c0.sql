
ALTER TABLE public.cash_ledger
  ADD COLUMN IF NOT EXISTS ocorrencia_id UUID REFERENCES public.ocorrencias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cash_ledger_ocorrencia_id
  ON public.cash_ledger(ocorrencia_id)
  WHERE ocorrencia_id IS NOT NULL;

ALTER TABLE public.ocorrencias
  ADD COLUMN IF NOT EXISTS resolucao_via_ajuste BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ajuste_ledger_id UUID REFERENCES public.cash_ledger(id) ON DELETE SET NULL;

CREATE OR REPLACE VIEW public.v_ocorrencias_possivelmente_resolvidas
WITH (security_invoker = on) AS
SELECT
  o.id                AS ocorrencia_id,
  o.workspace_id,
  o.titulo,
  o.tipo,
  o.sub_motivo,
  o.status,
  o.bookmaker_id,
  o.projeto_id,
  o.valor_risco,
  o.moeda,
  o.created_at        AS ocorrencia_criada_em,
  cl.id               AS ajuste_ledger_id,
  cl.valor            AS ajuste_valor,
  cl.moeda            AS ajuste_moeda,
  cl.data_transacao   AS ajuste_data,
  cl.descricao        AS ajuste_descricao
FROM public.ocorrencias o
JOIN public.cash_ledger cl
  ON (cl.origem_bookmaker_id = o.bookmaker_id OR cl.destino_bookmaker_id = o.bookmaker_id)
 AND cl.workspace_id = o.workspace_id
 AND cl.tipo_transacao = 'AJUSTE_RECONCILIACAO'
 AND cl.ocorrencia_id IS NULL
 AND cl.created_at >= o.created_at
WHERE o.status = 'aberto'
  AND o.bookmaker_id IS NOT NULL;

GRANT SELECT ON public.v_ocorrencias_possivelmente_resolvidas TO authenticated;
GRANT SELECT ON public.v_ocorrencias_possivelmente_resolvidas TO service_role;
