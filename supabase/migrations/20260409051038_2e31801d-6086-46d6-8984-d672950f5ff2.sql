
CREATE OR REPLACE VIEW public.v_freebets_disponibilidade
WITH (security_invoker=on) AS
WITH consumo_por_bookmaker AS (
  -- Total freebet consumed per bookmaker (negative STAKE events with FREEBET usage)
  SELECT
    fe.bookmaker_id,
    ABS(SUM(fe.valor)) AS total_consumido
  FROM financial_events fe
  WHERE fe.tipo_uso = 'FREEBET'
    AND fe.tipo_evento = 'STAKE'
    AND fe.event_scope = 'REAL'
  GROUP BY fe.bookmaker_id
),
freebets_ordered AS (
  SELECT
    fr.*,
    ROW_NUMBER() OVER (PARTITION BY fr.bookmaker_id ORDER BY fr.data_recebida ASC, fr.id ASC) AS rn,
    SUM(fr.valor) OVER (PARTITION BY fr.bookmaker_id ORDER BY fr.data_recebida ASC, fr.id ASC) AS cumulative_valor
  FROM freebets_recebidas fr
  WHERE fr.status = 'LIBERADA'
)
SELECT
  fr.id,
  fr.bookmaker_id,
  fr.projeto_id,
  fr.valor,
  fr.moeda_operacao,
  fr.motivo,
  fr.data_recebida,
  fr.data_validade,
  fr.data_utilizacao,
  fr.aposta_id,
  fr.status,
  fr.origem,
  fr.qualificadora_id,
  fr.tem_rollover,
  fr.workspace_id,
  fr.user_id,
  fr.aposta_multipla_id,
  -- Derived: is this freebet fully consumed?
  CASE
    WHEN fo.cumulative_valor IS NOT NULL 
         AND cpb.total_consumido IS NOT NULL 
         AND fo.cumulative_valor <= cpb.total_consumido THEN true
    ELSE false
  END AS utilizada_derivada,
  -- Derived: remaining value of this specific freebet
  CASE
    WHEN cpb.total_consumido IS NULL OR cpb.total_consumido = 0 THEN fr.valor
    WHEN fo.cumulative_valor IS NOT NULL AND fo.cumulative_valor <= cpb.total_consumido THEN 0
    WHEN fo.cumulative_valor IS NOT NULL AND (fo.cumulative_valor - fr.valor) < cpb.total_consumido THEN
      -- Partially consumed: this freebet has some remaining
      fo.cumulative_valor - cpb.total_consumido
    ELSE fr.valor
  END AS valor_restante
FROM freebets_recebidas fr
LEFT JOIN freebets_ordered fo ON fo.id = fr.id
LEFT JOIN consumo_por_bookmaker cpb ON cpb.bookmaker_id = fr.bookmaker_id;
