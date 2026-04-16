
-- ============================================================================
-- FIX: v_freebets_disponibilidade — considerar REVERSAL/AJUSTE no consumo
-- ============================================================================
-- Bug: a versão anterior somava apenas STAKEs negativos (consumo bruto),
-- ignorando REVERSAL/AJUSTE positivos no pool FREEBET (devoluções por
-- exclusão de aposta). Isso fazia stakes antigas já revertidas continuarem
-- "consumindo" freebets novas via FIFO, marcando-as utilizadas erradamente.
--
-- Correção: usar CONSUMO LÍQUIDO por bookmaker = SUM(-valor) apenas dos
-- débitos efetivos (STAKE com valor < 0) MINUS o que já foi devolvido
-- via REVERSAL/AJUSTE positivos vinculados a STAKEs.
--
-- Regra simples e robusta: consumo_liquido = -SUM(valor) sobre TODOS os
-- eventos do pool FREEBET com origem em STAKE/REVERSAL (excluindo créditos
-- de freebet, expirações e ajustes de reconciliação).
-- ============================================================================

DROP VIEW IF EXISTS public.v_freebets_disponibilidade CASCADE;

CREATE VIEW public.v_freebets_disponibilidade
WITH (security_invoker=on) AS
WITH consumo_liquido_por_bookmaker AS (
  -- Soma líquida de movimentos relacionados a APOSTAS (STAKE + REVERSAL de stake)
  -- no pool FREEBET. Positivo = consumo líquido pendente.
  --
  -- Inclui:
  --   - STAKE (negativo): debita freebet ao apostar
  --   - REVERSAL (positivo): devolve freebet ao excluir aposta
  --   - PAYOUT GREEN de freebet NÃO entra (não consome saldo nominal recebido)
  --
  -- Não inclui:
  --   - FREEBET_CREDIT (é a entrada do estoque, não consumo)
  --   - FREEBET_EXPIRE (expiração/cancelamento atrelado a um registro específico)
  --   - AJUSTE de RECONCILIACAO (já considerado no saldo físico)
  SELECT 
    fe.bookmaker_id,
    GREATEST(0, COALESCE(-SUM(fe.valor), 0))::numeric AS consumo_liquido
  FROM public.financial_events fe
  WHERE fe.tipo_uso = 'FREEBET'
    AND (
      fe.tipo_evento = 'STAKE'
      OR (fe.tipo_evento = 'REVERSAL' AND fe.origem IS DISTINCT FROM 'FREEBET')
    )
  GROUP BY fe.bookmaker_id
),
freebets_ativas AS (
  -- Freebets MANUAIS ainda ativas (não canceladas/expiradas via FREEBET_EXPIRE)
  -- Ordenadas por data_recebida ASC (FIFO)
  SELECT 
    fr.id,
    fr.bookmaker_id,
    fr.workspace_id,
    fr.user_id,
    fr.valor::numeric AS valor,
    fr.data_recebida,
    fr.data_validade,
    fr.utilizada,
    fr.data_utilizacao,
    fr.aposta_id,
    fr.qualificadora_id,
    fr.motivo,
    fr.created_at,
    b.moeda AS moeda_operacao,
    b.projeto_id,
    -- Marca canceladas (têm FREEBET_EXPIRE específico em janela ±5s)
    EXISTS (
      SELECT 1 FROM public.financial_events fe
      WHERE fe.bookmaker_id = fr.bookmaker_id
        AND fe.tipo_uso = 'FREEBET'
        AND fe.tipo_evento = 'FREEBET_EXPIRE'
        AND fe.valor = -fr.valor
        AND fe.created_at BETWEEN fr.created_at AND fr.created_at + INTERVAL '90 days'
        AND fe.descricao ILIKE '%' || COALESCE(fr.motivo, 'manual') || '%'
    ) AS foi_cancelada,
    ROW_NUMBER() OVER (PARTITION BY fr.bookmaker_id ORDER BY fr.data_recebida ASC, fr.created_at ASC) AS ordem_fifo
  FROM public.freebets_recebidas fr
  JOIN public.bookmakers b ON b.id = fr.bookmaker_id
  WHERE fr.utilizada = false
),
fifo_consumo AS (
  -- Aplica FIFO do consumo líquido sobre freebets NÃO canceladas
  SELECT 
    fa.*,
    SUM(CASE WHEN NOT fa.foi_cancelada THEN fa.valor ELSE 0 END) 
      OVER (PARTITION BY fa.bookmaker_id ORDER BY fa.ordem_fifo 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acumulado_ate_aqui,
    COALESCE(c.consumo_liquido, 0) AS consumo_total
  FROM freebets_ativas fa
  LEFT JOIN consumo_liquido_por_bookmaker c ON c.bookmaker_id = fa.bookmaker_id
)
SELECT 
  fc.id,
  fc.bookmaker_id,
  fc.workspace_id,
  fc.user_id,
  fc.projeto_id,
  fc.valor,
  fc.moeda_operacao,
  fc.data_recebida,
  fc.data_validade,
  fc.data_utilizacao,
  fc.aposta_id,
  NULL::uuid AS aposta_multipla_id,
  fc.qualificadora_id,
  fc.motivo,
  CASE WHEN fc.aposta_id IS NULL AND fc.qualificadora_id IS NULL THEN 'MANUAL'
       WHEN fc.qualificadora_id IS NOT NULL THEN 'QUALIFICADORA'
       ELSE 'PROMOCAO' END AS origem,
  false AS tem_rollover,
  -- Status: CANCELADA se houve FREEBET_EXPIRE; senão LIBERADA
  CASE 
    WHEN fc.foi_cancelada THEN 'CANCELADA'
    ELSE 'LIBERADA'
  END AS status,
  -- valor_restante: para canceladas é 0; para ativas, FIFO sobre o consumo líquido
  CASE 
    WHEN fc.foi_cancelada THEN 0::numeric
    ELSE GREATEST(
      0,
      LEAST(
        fc.valor,
        fc.acumulado_ate_aqui - LEAST(fc.acumulado_ate_aqui, fc.consumo_total)
      )
    )::numeric
  END AS valor_restante,
  -- utilizada_derivada: true se totalmente consumida OU cancelada
  CASE 
    WHEN fc.foi_cancelada THEN false  -- cancelada não conta como utilizada
    ELSE (fc.acumulado_ate_aqui <= fc.consumo_total)
  END AS utilizada_derivada
FROM fifo_consumo fc;

COMMENT ON VIEW public.v_freebets_disponibilidade IS 
'FIFO consciente de reversões: consumo líquido = STAKE + REVERSAL no pool FREEBET. Freebets canceladas (FREEBET_EXPIRE) ficam com status=CANCELADA e não consomem. Evita o bug "freebet fantasma utilizada".';
