
CREATE OR REPLACE FUNCTION public.get_projeto_lucro_operacional_daily(
  p_projeto_id uuid,
  p_cotacoes jsonb DEFAULT '{}'::jsonb,
  p_data_inicio text DEFAULT NULL,
  p_data_fim text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_start_date date;
  v_end_date date;
  v_moeda_consolidacao text;
  v_bm_ids uuid[];
  v_daily jsonb;
BEGIN
  -- Buscar moeda de consolidação do projeto
  SELECT p.moeda_consolidacao INTO v_moeda_consolidacao
  FROM projetos p WHERE p.id = p_projeto_id;

  IF v_moeda_consolidacao IS NULL THEN
    v_moeda_consolidacao := 'BRL';
  END IF;

  -- Buscar bookmakers do projeto
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_bm_ids
  FROM bookmakers WHERE projeto_id = p_projeto_id;

  -- Converter datas
  IF p_data_inicio IS NOT NULL THEN
    v_start_ts := (p_data_inicio || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_start_date := p_data_inicio::date;
  END IF;
  IF p_data_fim IS NOT NULL THEN
    v_end_ts := (p_data_fim || ' 23:59:59.999')::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_end_date := p_data_fim::date;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- FUNÇÃO INLINE: converter valor para moeda de consolidação
  -- Usa p_cotacoes (jsonb): { "BRL": 5.28, "EUR": 6.09, ... }
  -- Cada chave = moeda, valor = quanto 1 unidade vale na moeda de consolidação
  -- ══════════════════════════════════════════════════════════════

  WITH
  -- 1) APOSTAS (não-multicurrency)
  apostas_daily AS (
    SELECT
      (a.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE WHEN UPPER(COALESCE(a.moeda_operacao, 'BRL')) IN ('USDT','USDC') THEN 'USD'
           ELSE UPPER(COALESCE(a.moeda_operacao, 'BRL')) END AS moeda,
      COALESCE(a.lucro_prejuizo, 0) AS val
    FROM apostas_unificada a
    WHERE a.projeto_id = p_projeto_id
      AND a.status = 'LIQUIDADA'
      AND (a.is_multicurrency IS NOT TRUE)
      AND (v_start_ts IS NULL OR a.data_aposta >= v_start_ts)
      AND (v_end_ts IS NULL OR a.data_aposta <= v_end_ts)
  ),
  -- 2) APOSTAS multicurrency (por perna)
  apostas_mc_daily AS (
    SELECT
      (a.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE WHEN UPPER(COALESCE(p.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
           ELSE UPPER(COALESCE(p.moeda, 'BRL')) END AS moeda,
      COALESCE(p.lucro_prejuizo, 0) AS val
    FROM apostas_unificada a
    JOIN apostas_pernas p ON p.aposta_id = a.id
    WHERE a.projeto_id = p_projeto_id
      AND a.status = 'LIQUIDADA'
      AND a.is_multicurrency = TRUE
      AND (v_start_ts IS NULL OR a.data_aposta >= v_start_ts)
      AND (v_end_ts IS NULL OR a.data_aposta <= v_end_ts)
  ),
  -- 3) CASHBACK
  cashback_daily AS (
    SELECT
      c.data_credito AS dia,
      CASE WHEN UPPER(COALESCE(c.moeda_operacao, 'BRL')) IN ('USDT','USDC') THEN 'USD'
           ELSE UPPER(COALESCE(c.moeda_operacao, 'BRL')) END AS moeda,
      COALESCE(c.valor, 0) AS val
    FROM cashback_manual c
    WHERE c.projeto_id = p_projeto_id
      AND (v_start_date IS NULL OR c.data_credito >= v_start_date)
      AND (v_end_date IS NULL OR c.data_credito <= v_end_date)
  ),
  -- 4) GIROS GRÁTIS
  giros_daily AS (
    SELECT
      (g.data_registro AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE WHEN UPPER(COALESCE(b.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
           ELSE UPPER(COALESCE(b.moeda, 'BRL')) END AS moeda,
      GREATEST(COALESCE(g.valor_retorno, 0), 0) AS val
    FROM giros_gratis g
    JOIN bookmakers b ON b.id = g.bookmaker_id
    WHERE g.projeto_id = p_projeto_id
      AND g.status = 'confirmado'
      AND g.valor_retorno IS NOT NULL AND g.valor_retorno > 0
      AND (v_start_ts IS NULL OR g.data_registro >= v_start_ts)
      AND (v_end_ts IS NULL OR g.data_registro <= v_end_ts)
  ),
  -- 5) BÔNUS (exceto FREEBET)
  bonus_daily AS (
    SELECT
      (bl.credited_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE WHEN UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
           ELSE UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) END AS moeda,
      COALESCE(bl.bonus_amount, 0) AS val
    FROM project_bookmaker_link_bonuses bl
    LEFT JOIN bookmakers b ON b.id = bl.bookmaker_id
    WHERE bl.project_id = p_projeto_id
      AND bl.status IN ('credited', 'finalized')
      AND bl.credited_at IS NOT NULL
      AND (bl.tipo_bonus IS NULL OR bl.tipo_bonus != 'FREEBET')
      AND COALESCE(bl.bonus_amount, 0) > 0
      AND (v_start_ts IS NULL OR bl.credited_at >= v_start_ts)
      AND (v_end_ts IS NULL OR bl.credited_at <= v_end_ts)
  ),
  -- 6) CONCILIAÇÕES
  conciliacoes_daily AS (
    SELECT
      (ba.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE WHEN UPPER(COALESCE(b.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
           ELSE UPPER(COALESCE(b.moeda, 'BRL')) END AS moeda,
      (COALESCE(ba.saldo_novo, 0) - COALESCE(ba.saldo_anterior, 0)) AS val
    FROM bookmaker_balance_audit ba
    JOIN bookmakers b ON b.id = ba.bookmaker_id
    WHERE ba.origem = 'CONCILIACAO_VINCULO'
      AND ba.referencia_tipo = 'projeto'
      AND ba.referencia_id = p_projeto_id
      AND (v_start_ts IS NULL OR ba.created_at >= v_start_ts)
      AND (v_end_ts IS NULL OR ba.created_at <= v_end_ts)
  ),
  -- 7) AJUSTES DE SALDO (cash_ledger)
  ajustes_daily AS (
    SELECT
      (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
           ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END AS moeda,
      CASE WHEN cl.ajuste_direcao = 'SAIDA' THEN -COALESCE(cl.valor, 0)
           ELSE COALESCE(cl.valor, 0) END AS val
    FROM cash_ledger cl
    WHERE cl.status = 'CONFIRMADO'
      AND cl.tipo_transacao = 'AJUSTE_SALDO'
      AND cl.projeto_id_snapshot = p_projeto_id
      AND COALESCE(cl.valor, 0) != 0
      AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
      AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
  ),
  -- 8) RESULTADO CAMBIAL
  fx_daily AS (
    SELECT
      (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
           ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END AS moeda,
      CASE WHEN cl.tipo_transacao = 'PERDA_CAMBIAL' THEN -COALESCE(cl.valor, 0)
           ELSE COALESCE(cl.valor, 0) END AS val
    FROM cash_ledger cl
    WHERE cl.status = 'CONFIRMADO'
      AND cl.tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL')
      AND cl.projeto_id_snapshot = p_projeto_id
      AND COALESCE(cl.valor, 0) != 0
      AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
      AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
  ),
  -- 9) EVENTOS PROMOCIONAIS
  promo_daily AS (
    SELECT
      (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
           ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END AS moeda,
      COALESCE(cl.valor, 0) AS val
    FROM cash_ledger cl
    WHERE cl.status = 'CONFIRMADO'
      AND cl.tipo_transacao IN ('FREEBET_CONVERTIDA', 'CREDITO_PROMOCIONAL', 'GIRO_GRATIS_GANHO')
      AND cl.destino_bookmaker_id = ANY(v_bm_ids)
      AND COALESCE(cl.valor, 0) > 0
      AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
      AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
  ),
  -- 10) PERDAS OPERACIONAIS (subtrai)
  perdas_daily AS (
    SELECT
      (pp.data_registro AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE WHEN UPPER(COALESCE(b.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
           ELSE UPPER(COALESCE(b.moeda, 'BRL')) END AS moeda,
      -COALESCE(pp.valor, 0) AS val  -- negativo: subtrai do lucro
    FROM projeto_perdas pp
    LEFT JOIN bookmakers b ON b.id = pp.bookmaker_id
    WHERE pp.projeto_id = p_projeto_id AND pp.status = 'CONFIRMADA'
      AND COALESCE(pp.valor, 0) > 0
      AND (v_start_ts IS NULL OR pp.data_registro >= v_start_ts)
      AND (v_end_ts IS NULL OR pp.data_registro <= v_end_ts)
  ),
  -- 11) PERDAS CANCELAMENTO BÔNUS (subtrai)
  perdas_cancel_daily AS (
    SELECT
      (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
           ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END AS moeda,
      -COALESCE(
        (cl.auditoria_metadata::jsonb ->> 'valor_perdido')::numeric,
        cl.valor,
        0
      ) AS val  -- negativo: subtrai do lucro
    FROM cash_ledger cl
    WHERE cl.ajuste_motivo = 'BONUS_CANCELAMENTO'
      AND cl.ajuste_direcao = 'SAIDA'
      AND cl.origem_bookmaker_id = ANY(v_bm_ids)
      AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
      AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
  ),
  -- UNION ALL de todos os módulos
  all_events AS (
    SELECT dia, moeda, val FROM apostas_daily
    UNION ALL SELECT dia, moeda, val FROM apostas_mc_daily
    UNION ALL SELECT dia, moeda, val FROM cashback_daily
    UNION ALL SELECT dia, moeda, val FROM giros_daily
    UNION ALL SELECT dia, moeda, val FROM bonus_daily
    UNION ALL SELECT dia, moeda, val FROM conciliacoes_daily
    UNION ALL SELECT dia, moeda, val FROM ajustes_daily
    UNION ALL SELECT dia, moeda, val FROM fx_daily
    UNION ALL SELECT dia, moeda, val FROM promo_daily
    UNION ALL SELECT dia, moeda, val FROM perdas_daily
    UNION ALL SELECT dia, moeda, val FROM perdas_cancel_daily
  ),
  -- Converter cada evento para moeda de consolidação
  converted AS (
    SELECT
      dia,
      SUM(
        CASE
          -- Identidade: moeda de origem = moeda de consolidação
          WHEN moeda = v_moeda_consolidacao THEN val
          -- USD-like para BRL
          WHEN moeda IN ('USD', 'USDT', 'USDC') AND v_moeda_consolidacao = 'BRL' THEN
            val * COALESCE((p_cotacoes ->> 'USD')::numeric, (p_cotacoes ->> 'BRL')::numeric, 5.0)
          -- BRL para USD-like
          WHEN moeda = 'BRL' AND v_moeda_consolidacao IN ('USD', 'USDT', 'USDC') THEN
            CASE WHEN COALESCE((p_cotacoes ->> 'BRL')::numeric, 0) > 0 
                 THEN val * (p_cotacoes ->> 'BRL')::numeric
                 WHEN COALESCE((p_cotacoes ->> 'USD')::numeric, 0) > 0 
                 THEN val / (p_cotacoes ->> 'USD')::numeric
                 ELSE val / 5.0
            END
          -- Outras moedas com cotação no map
          WHEN p_cotacoes ? moeda THEN val * (p_cotacoes ->> moeda)::numeric
          -- Fallback: sem conversão
          ELSE val
        END
      ) AS lucro
    FROM converted_raw
    GROUP BY dia
  ),
  -- Fix: use "all_events" not "converted_raw"
  daily_agg AS (
    SELECT
      e.dia,
      SUM(
        CASE
          WHEN e.moeda = v_moeda_consolidacao THEN e.val
          WHEN e.moeda IN ('USD', 'USDT', 'USDC') AND v_moeda_consolidacao = 'BRL' THEN
            e.val * COALESCE((p_cotacoes ->> 'USD')::numeric, (p_cotacoes ->> 'BRL')::numeric, 5.0)
          WHEN e.moeda = 'BRL' AND v_moeda_consolidacao IN ('USD', 'USDT', 'USDC') THEN
            CASE WHEN COALESCE((p_cotacoes ->> 'BRL')::numeric, 0) > 0 
                 THEN e.val * (p_cotacoes ->> 'BRL')::numeric
                 WHEN COALESCE((p_cotacoes ->> 'USD')::numeric, 0) > 0 
                 THEN e.val / (p_cotacoes ->> 'USD')::numeric
                 ELSE e.val / 5.0
            END
          WHEN p_cotacoes ? e.moeda THEN e.val * (p_cotacoes ->> e.moeda)::numeric
          ELSE e.val
        END
      ) AS lucro
    FROM all_events e
    GROUP BY e.dia
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('dia', d.dia::text, 'lucro', ROUND(d.lucro, 2))
    ORDER BY d.dia
  ), '[]'::jsonb)
  INTO v_daily
  FROM daily_agg d
  WHERE ABS(d.lucro) >= 0.01;

  RETURN v_daily;
END;
$$;
