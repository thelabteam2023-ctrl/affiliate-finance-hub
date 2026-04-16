
CREATE OR REPLACE VIEW public.v_freebets_disponibilidade AS
WITH consumo_por_bookmaker AS (
  -- STAKEs de freebet são gravados como valores NEGATIVOS no ledger.
  -- Consumo = -SUM(STAKE). REVERSAL devolve (ABS positivo, então subtrai do consumo).
  SELECT 
    fe.bookmaker_id,
    SUM(
      CASE 
        WHEN fe.tipo_evento = 'STAKE' THEN -fe.valor  -- STAKE negativo vira consumo positivo
        WHEN fe.tipo_evento = 'REVERSAL' AND fe.reversed_event_id IS NOT NULL THEN -ABS(fe.valor)
        ELSE 0
      END
    ) AS total_consumido
  FROM financial_events fe
  WHERE fe.tipo_uso = 'FREEBET' 
    AND fe.event_scope = 'REAL'
    AND fe.tipo_evento IN ('STAKE', 'REVERSAL')
  GROUP BY fe.bookmaker_id
),
freebets_ordenadas AS (
  SELECT 
    fr.*,
    COALESCE(SUM(fr.valor) OVER (
      PARTITION BY fr.bookmaker_id 
      ORDER BY fr.data_recebida ASC, fr.id ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0) AS valor_acumulado_anterior
  FROM freebets_recebidas fr
  WHERE fr.status IN ('LIBERADA', 'PENDENTE')
),
freebets_calculadas AS (
  SELECT 
    fo.id,
    fo.bookmaker_id,
    fo.valor,
    fo.valor_acumulado_anterior,
    COALESCE(cb.total_consumido, 0) AS total_consumido_bookmaker,
    GREATEST(
      0::numeric,
      LEAST(
        fo.valor,
        COALESCE(cb.total_consumido, 0) - fo.valor_acumulado_anterior
      )
    ) AS valor_consumido_desta
  FROM freebets_ordenadas fo
  LEFT JOIN consumo_por_bookmaker cb ON cb.bookmaker_id = fo.bookmaker_id
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
  CASE
    WHEN fr.aposta_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM financial_events fe
      WHERE fe.aposta_id = fr.aposta_id 
        AND fe.tipo_uso = 'FREEBET' 
        AND fe.tipo_evento = 'STAKE'
    ) THEN true
    WHEN fc.valor_consumido_desta >= fr.valor THEN true
    ELSE false
  END AS utilizada_derivada,
  CASE
    WHEN fr.aposta_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM financial_events fe
      WHERE fe.aposta_id = fr.aposta_id 
        AND fe.tipo_uso = 'FREEBET' 
        AND fe.tipo_evento = 'STAKE'
    ) THEN 0::numeric
    ELSE GREATEST(0::numeric, fr.valor - COALESCE(fc.valor_consumido_desta, 0))
  END AS valor_restante
FROM freebets_recebidas fr
LEFT JOIN freebets_calculadas fc ON fc.id = fr.id;
