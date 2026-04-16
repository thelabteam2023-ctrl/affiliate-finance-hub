
DROP VIEW IF EXISTS public.v_freebets_disponibilidade CASCADE;

CREATE VIEW public.v_freebets_disponibilidade
WITH (security_invoker=on) AS
WITH freebets_base AS (
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
    b.saldo_freebet::numeric AS saldo_fisico,
    -- Detecta cancelamento explícito via FREEBET_EXPIRE específico
    EXISTS (
      SELECT 1 FROM public.financial_events fe
      WHERE fe.bookmaker_id = fr.bookmaker_id
        AND fe.tipo_uso = 'FREEBET'
        AND fe.tipo_evento = 'FREEBET_EXPIRE'
        AND fe.valor = -fr.valor
        AND fe.created_at BETWEEN fr.created_at AND fr.created_at + INTERVAL '90 days'
        AND fe.descricao ILIKE '%' || COALESCE(fr.motivo, 'manual') || '%'
    ) AS foi_cancelada
  FROM public.freebets_recebidas fr
  JOIN public.bookmakers b ON b.id = fr.bookmaker_id
  WHERE fr.utilizada = false
),
freebets_ativas_fifo AS (
  -- Apenas as ativas (não canceladas) participam da distribuição do saldo físico
  -- FIFO direto: mais antigas consomem o saldo primeiro
  SELECT 
    fb.*,
    SUM(fb.valor) OVER (
      PARTITION BY fb.bookmaker_id 
      ORDER BY fb.data_recebida ASC, fb.created_at ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS acumulado
  FROM freebets_base fb
  WHERE NOT fb.foi_cancelada
)
SELECT 
  fb.id,
  fb.bookmaker_id,
  fb.workspace_id,
  fb.user_id,
  fb.projeto_id,
  fb.valor,
  fb.moeda_operacao,
  fb.data_recebida,
  fb.data_validade,
  fb.data_utilizacao,
  fb.aposta_id,
  NULL::uuid AS aposta_multipla_id,
  fb.qualificadora_id,
  fb.motivo,
  CASE WHEN fb.aposta_id IS NULL AND fb.qualificadora_id IS NULL THEN 'MANUAL'
       WHEN fb.qualificadora_id IS NOT NULL THEN 'QUALIFICADORA'
       ELSE 'PROMOCAO' END AS origem,
  false AS tem_rollover,
  CASE 
    WHEN fb.foi_cancelada THEN 'CANCELADA'
    ELSE 'LIBERADA'
  END AS status,
  -- valor_restante: distribui saldo_fisico em FIFO sobre as ativas
  CASE 
    WHEN fb.foi_cancelada THEN 0::numeric
    ELSE COALESCE(
      (SELECT 
        GREATEST(0, LEAST(
          faf.valor,
          faf.saldo_fisico - (faf.acumulado - faf.valor)
        ))::numeric
      FROM freebets_ativas_fifo faf 
      WHERE faf.id = fb.id),
      0
    )
  END AS valor_restante,
  CASE 
    WHEN fb.foi_cancelada THEN false
    ELSE COALESCE(
      (SELECT 
        (faf.acumulado > faf.saldo_fisico)
      FROM freebets_ativas_fifo faf 
      WHERE faf.id = fb.id),
      false
    )
  END AS utilizada_derivada
FROM freebets_base fb;

COMMENT ON VIEW public.v_freebets_disponibilidade IS 
'Distribui o saldo físico bookmakers.saldo_freebet em FIFO (mais antiga primeiro) entre freebets ativas. Cancelados (FREEBET_EXPIRE) têm status CANCELADA e valor_restante=0. Esta abordagem elimina dependência de REVERSALs com sinais variados.';
