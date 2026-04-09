
CREATE OR REPLACE VIEW public.v_freebets_disponibilidade
WITH (security_invoker=on) AS
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
  -- Derived from ledger: freebet is fully used when bookmaker has no freebet balance left
  -- and there are STAKE events consuming freebet for this bookmaker
  CASE
    WHEN fr.aposta_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM financial_events fe
      WHERE fe.aposta_id = fr.aposta_id
        AND fe.tipo_uso = 'FREEBET'
        AND fe.tipo_evento = 'STAKE'
    ) THEN true
    WHEN b.saldo_freebet <= 0 AND EXISTS (
      SELECT 1 FROM financial_events fe
      WHERE fe.bookmaker_id = fr.bookmaker_id
        AND fe.tipo_uso = 'FREEBET'
        AND fe.tipo_evento = 'STAKE'
        AND fe.event_scope = 'REAL'
    ) THEN true
    ELSE false
  END AS utilizada_derivada,
  -- valor_restante: for the last active freebet, use bookmaker's actual saldo_freebet
  -- For consumed freebets, return 0
  CASE
    WHEN fr.aposta_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM financial_events fe
      WHERE fe.aposta_id = fr.aposta_id
        AND fe.tipo_uso = 'FREEBET'
        AND fe.tipo_evento = 'STAKE'
    ) THEN 0
    WHEN b.saldo_freebet <= 0 AND EXISTS (
      SELECT 1 FROM financial_events fe
      WHERE fe.bookmaker_id = fr.bookmaker_id
        AND fe.tipo_uso = 'FREEBET'
        AND fe.tipo_evento = 'STAKE'
        AND fe.event_scope = 'REAL'
    ) THEN 0
    ELSE GREATEST(0, LEAST(fr.valor, COALESCE(b.saldo_freebet, 0)))
  END AS valor_restante
FROM freebets_recebidas fr
LEFT JOIN bookmakers b ON b.id = fr.bookmaker_id;
