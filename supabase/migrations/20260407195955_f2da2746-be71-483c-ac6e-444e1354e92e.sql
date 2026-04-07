
-- ============================================================================
-- v_freebets_disponibilidade: Derives freebet state from ledger
-- Eliminates dependency on manual utilizada flag
-- ============================================================================

CREATE OR REPLACE VIEW public.v_freebets_disponibilidade
WITH (security_invoker = true)
AS
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
  -- DERIVED: utilizada is true ONLY if aposta_id is set AND the bet still exists
  CASE
    WHEN fr.aposta_id IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM apostas_unificada au WHERE au.id = fr.aposta_id
      )
      AND EXISTS (
        SELECT 1 FROM financial_events fe 
        WHERE fe.aposta_id = fr.aposta_id
          AND fe.tipo_evento = 'FREEBET_STAKE'
          AND fe.tipo_uso = 'FREEBET'
      )
    THEN true
    ELSE false
  END AS utilizada_derivada,
  -- DERIVED: valor_restante based on actual consumption
  CASE
    WHEN fr.aposta_id IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM apostas_unificada au WHERE au.id = fr.aposta_id
      )
      AND EXISTS (
        SELECT 1 FROM financial_events fe 
        WHERE fe.aposta_id = fr.aposta_id
          AND fe.tipo_evento = 'FREEBET_STAKE'
          AND fe.tipo_uso = 'FREEBET'
      )
    THEN 0
    ELSE fr.valor
  END AS valor_restante
FROM freebets_recebidas fr;

-- Grant access
GRANT SELECT ON public.v_freebets_disponibilidade TO authenticated;
GRANT SELECT ON public.v_freebets_disponibilidade TO anon;
