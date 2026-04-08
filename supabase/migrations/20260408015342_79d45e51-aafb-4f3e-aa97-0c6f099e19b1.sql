CREATE OR REPLACE VIEW public.v_freebets_disponibilidade AS
SELECT 
  id,
  bookmaker_id,
  projeto_id,
  valor,
  moeda_operacao,
  motivo,
  data_recebida,
  data_validade,
  data_utilizacao,
  aposta_id,
  status,
  origem,
  qualificadora_id,
  tem_rollover,
  workspace_id,
  user_id,
  aposta_multipla_id,
  CASE
    WHEN aposta_id IS NOT NULL 
      AND EXISTS (SELECT 1 FROM apostas_unificada au WHERE au.id = fr.aposta_id)
      AND EXISTS (
        SELECT 1 FROM financial_events fe
        WHERE fe.aposta_id = fr.aposta_id
          AND (
            (fe.tipo_evento = 'FREEBET_STAKE' AND fe.tipo_uso = 'FREEBET')
            OR
            (fe.tipo_evento = 'STAKE' AND fe.tipo_uso = 'FREEBET')
          )
      )
    THEN true
    ELSE false
  END AS utilizada_derivada,
  CASE
    WHEN aposta_id IS NOT NULL 
      AND EXISTS (SELECT 1 FROM apostas_unificada au WHERE au.id = fr.aposta_id)
      AND EXISTS (
        SELECT 1 FROM financial_events fe
        WHERE fe.aposta_id = fr.aposta_id
          AND (
            (fe.tipo_evento = 'FREEBET_STAKE' AND fe.tipo_uso = 'FREEBET')
            OR
            (fe.tipo_evento = 'STAKE' AND fe.tipo_uso = 'FREEBET')
          )
      )
    THEN 0::numeric
    ELSE valor
  END AS valor_restante
FROM freebets_recebidas fr;