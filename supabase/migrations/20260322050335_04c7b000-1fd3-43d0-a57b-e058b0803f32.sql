CREATE OR REPLACE FUNCTION public.convert_to_target_currency(
  p_value numeric,
  p_currency text,
  p_target_currency text,
  p_usd_rate numeric,
  p_rates jsonb DEFAULT '{}'::jsonb
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_value numeric := COALESCE(p_value, 0);
  v_origin text := UPPER(COALESCE(p_currency, 'BRL'));
  v_target text := UPPER(COALESCE(p_target_currency, 'BRL'));
  v_origin_brl numeric;
  v_target_brl numeric;
BEGIN
  IF v_origin IN ('USDT', 'USDC') THEN v_origin := 'USD'; END IF;
  IF v_target IN ('USDT', 'USDC') THEN v_target := 'USD'; END IF;

  IF v_value = 0 OR v_origin = v_target THEN
    RETURN v_value;
  END IF;

  IF v_origin = 'BRL' THEN
    v_origin_brl := 1;
  ELSIF v_origin = 'USD' THEN
    v_origin_brl := NULLIF(p_usd_rate, 0);
  ELSIF p_rates ? v_origin THEN
    v_origin_brl := NULLIF((p_rates ->> v_origin)::numeric, 0);
  END IF;

  IF v_target = 'BRL' THEN
    v_target_brl := 1;
  ELSIF v_target = 'USD' THEN
    v_target_brl := NULLIF(p_usd_rate, 0);
  ELSIF p_rates ? v_target THEN
    v_target_brl := NULLIF((p_rates ->> v_target)::numeric, 0);
  END IF;

  IF v_origin_brl IS NULL OR v_target_brl IS NULL THEN
    RETURN v_value;
  END IF;

  RETURN (v_value * v_origin_brl) / v_target_brl;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_projeto_apostas_resumo(
  p_projeto_id uuid,
  p_data_inicio text DEFAULT NULL::text,
  p_data_fim text DEFAULT NULL::text,
  p_estrategia text DEFAULT NULL::text,
  p_cotacao_usd numeric DEFAULT NULL::numeric,
  p_cotacoes jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_result jsonb;
  v_nao_arb_count bigint;
  v_pernas_count bigint := 0;
  v_greens bigint;
  v_reds bigint;
  v_voids bigint;
  v_meio_greens bigint;
  v_meio_reds bigint;
  v_pendentes bigint;
  v_pernas_greens bigint := 0;
  v_pernas_reds bigint := 0;
  v_pernas_voids bigint := 0;
  v_pernas_meio_greens bigint := 0;
  v_pernas_meio_reds bigint := 0;
  v_total_stake_nao_arb numeric := 0;
  v_total_stake_pernas numeric := 0;
  v_lucro_apostas numeric := 0;
  v_lucro_cashback numeric := 0;
  v_lucro_giros numeric := 0;
  v_lucro_bonus numeric := 0;
  v_lucro_promocionais numeric := 0;
  v_lucro_ajustes numeric := 0;
  v_lucro_resultado_cambial numeric := 0;
  v_lucro_conciliacoes numeric := 0;
  v_lucro_perdas_cancelamento numeric := 0;
  v_lucro_perdas_operacionais numeric := 0;
  v_daily jsonb;
  v_moeda_consolidacao text;
  v_cotacao numeric;
BEGIN
  SELECT p.moeda_consolidacao,
         COALESCE(p_cotacao_usd, p.cotacao_trabalho, 5.0)
  INTO v_moeda_consolidacao, v_cotacao
  FROM public.projetos p
  WHERE p.id = p_projeto_id;

  IF p_data_inicio IS NOT NULL THEN
    v_start_ts := (p_data_inicio || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  END IF;
  IF p_data_fim IS NOT NULL THEN
    v_end_ts := (p_data_fim || ' 23:59:59.999999')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'GREEN' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'RED' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'VOID' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE (resultado = 'MEIO_GREEN' OR resultado = 'HALF') AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'MEIO_RED' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE status = 'PENDENTE'),
    COALESCE(SUM(CASE
      WHEN forma_registro != 'ARBITRAGEM' THEN
        CASE
          WHEN stake_consolidado IS NOT NULL AND consolidation_currency = v_moeda_consolidacao THEN stake_consolidado
          ELSE public.convert_to_target_currency(COALESCE(stake, 0), COALESCE(moeda_operacao, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
        END
      ELSE 0
    END), 0),
    COALESCE(SUM(
      CASE
        WHEN pl_consolidado IS NOT NULL AND consolidation_currency = v_moeda_consolidacao THEN pl_consolidado
        ELSE public.convert_to_target_currency(COALESCE(lucro_prejuizo, 0), COALESCE(moeda_operacao, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
      END
    ), 0)
  INTO v_nao_arb_count, v_greens, v_reds, v_voids, v_meio_greens, v_meio_reds, v_pendentes, v_total_stake_nao_arb, v_lucro_apostas
  FROM public.apostas_unificada
  WHERE projeto_id = p_projeto_id
    AND cancelled_at IS NULL
    AND (v_start_ts IS NULL OR data_aposta >= v_start_ts)
    AND (v_end_ts IS NULL OR data_aposta <= v_end_ts)
    AND (p_estrategia IS NULL OR estrategia = p_estrategia);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE ap.resultado = 'GREEN'),
    COUNT(*) FILTER (WHERE ap.resultado = 'RED'),
    COUNT(*) FILTER (WHERE ap.resultado = 'VOID'),
    COUNT(*) FILTER (WHERE ap.resultado = 'MEIO_GREEN' OR ap.resultado = 'HALF'),
    COUNT(*) FILTER (WHERE ap.resultado = 'MEIO_RED'),
    COALESCE(SUM(
      public.convert_to_target_currency(COALESCE(ap.stake, 0), COALESCE(ap.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
    ), 0)
  INTO v_pernas_count, v_pernas_greens, v_pernas_reds, v_pernas_voids, v_pernas_meio_greens, v_pernas_meio_reds, v_total_stake_pernas
  FROM public.apostas_pernas ap
  JOIN public.apostas_unificada au ON ap.aposta_id = au.id
  WHERE au.projeto_id = p_projeto_id
    AND au.cancelled_at IS NULL
    AND au.forma_registro = 'ARBITRAGEM'
    AND (v_start_ts IS NULL OR au.data_aposta >= v_start_ts)
    AND (v_end_ts IS NULL OR au.data_aposta <= v_end_ts)
    AND (p_estrategia IS NULL OR au.estrategia = p_estrategia);

  IF p_estrategia IS NULL THEN
    SELECT COALESCE(SUM(
      public.convert_to_target_currency(COALESCE(cb.valor, 0), COALESCE(cb.moeda_operacao, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
    ), 0)
    INTO v_lucro_cashback
    FROM public.cashback_manual cb
    WHERE cb.projeto_id = p_projeto_id
      AND (p_data_inicio IS NULL OR cb.data_credito >= p_data_inicio::date)
      AND (p_data_fim IS NULL OR cb.data_credito <= p_data_fim::date);

    SELECT COALESCE(SUM(
      public.convert_to_target_currency(COALESCE(gg.valor_retorno, 0), COALESCE(b.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
    ), 0)
    INTO v_lucro_giros
    FROM public.giros_gratis gg
    LEFT JOIN public.bookmakers b ON b.id = gg.bookmaker_id
    WHERE gg.projeto_id = p_projeto_id
      AND gg.status = 'CONFIRMADO'
      AND gg.valor_retorno IS NOT NULL
      AND (p_data_inicio IS NULL OR gg.data_registro >= p_data_inicio::date)
      AND (p_data_fim IS NULL OR gg.data_registro <= p_data_fim::date);

    SELECT COALESCE(SUM(
      public.convert_to_target_currency(
        COALESCE(bl.bonus_amount, 0),
        COALESCE(bl.currency, b.moeda, 'BRL'),
        v_moeda_consolidacao,
        v_cotacao,
        p_cotacoes
      )
    ), 0)
    INTO v_lucro_bonus
    FROM public.project_bookmaker_link_bonuses bl
    LEFT JOIN public.bookmakers b ON b.id = bl.bookmaker_id
    WHERE bl.project_id = p_projeto_id
      AND bl.status IN ('credited', 'finalized')
      AND bl.credited_at IS NOT NULL
      AND (bl.tipo_bonus IS NULL OR bl.tipo_bonus != 'FREEBET')
      AND COALESCE(bl.bonus_amount, 0) > 0
      AND (v_start_ts IS NULL OR bl.credited_at >= v_start_ts)
      AND (v_end_ts IS NULL OR bl.credited_at <= v_end_ts);

    SELECT COALESCE(SUM(
      public.convert_to_target_currency(COALESCE(cl.valor, 0), COALESCE(cl.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
    ), 0)
    INTO v_lucro_promocionais
    FROM public.cash_ledger cl
    WHERE cl.status = 'CONFIRMADO'
      AND cl.tipo_transacao IN ('FREEBET_CONVERTIDA', 'CREDITO_PROMOCIONAL', 'GIRO_GRATIS_GANHO')
      AND cl.destino_bookmaker_id IN (SELECT id FROM public.bookmakers WHERE projeto_id = p_projeto_id)
      AND COALESCE(cl.valor, 0) > 0
      AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
      AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts);

    SELECT COALESCE(SUM(
      CASE
        WHEN cl.ajuste_direcao = 'SAIDA' THEN -public.convert_to_target_currency(COALESCE(cl.valor, 0), COALESCE(cl.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
        ELSE public.convert_to_target_currency(COALESCE(cl.valor, 0), COALESCE(cl.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
      END
    ), 0)
    INTO v_lucro_ajustes
    FROM public.cash_ledger cl
    WHERE cl.status = 'CONFIRMADO'
      AND cl.tipo_transacao = 'AJUSTE_SALDO'
      AND cl.projeto_id_snapshot = p_projeto_id
      AND COALESCE(cl.valor, 0) != 0
      AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
      AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts);

    SELECT COALESCE(SUM(
      CASE
        WHEN cl.tipo_transacao = 'PERDA_CAMBIAL' THEN -public.convert_to_target_currency(COALESCE(cl.valor, 0), COALESCE(cl.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
        ELSE public.convert_to_target_currency(COALESCE(cl.valor, 0), COALESCE(cl.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
      END
    ), 0)
    INTO v_lucro_resultado_cambial
    FROM public.cash_ledger cl
    WHERE cl.status = 'CONFIRMADO'
      AND cl.tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL')
      AND cl.projeto_id_snapshot = p_projeto_id
      AND COALESCE(cl.valor, 0) != 0
      AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
      AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts);

    SELECT COALESCE(SUM(
      public.convert_to_target_currency(COALESCE(ba.diferenca, 0), COALESCE(b.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
    ), 0)
    INTO v_lucro_conciliacoes
    FROM public.bookmaker_balance_audit ba
    JOIN public.bookmakers b ON b.id = ba.bookmaker_id
    WHERE ba.origem = 'CONCILIACAO_VINCULO'
      AND ba.referencia_tipo = 'projeto'
      AND ba.referencia_id = p_projeto_id
      AND COALESCE(ba.diferenca, 0) != 0
      AND (v_start_ts IS NULL OR ba.created_at >= v_start_ts)
      AND (v_end_ts IS NULL OR ba.created_at <= v_end_ts);

    SELECT COALESCE(SUM(
      -public.convert_to_target_currency(
        COALESCE((cl.auditoria_metadata::jsonb ->> 'valor_perdido')::numeric, cl.valor, 0),
        COALESCE(cl.moeda, 'BRL'),
        v_moeda_consolidacao,
        v_cotacao,
        p_cotacoes
      )
    ), 0)
    INTO v_lucro_perdas_cancelamento
    FROM public.cash_ledger cl
    WHERE cl.ajuste_motivo = 'BONUS_CANCELAMENTO'
      AND cl.ajuste_direcao = 'SAIDA'
      AND cl.origem_bookmaker_id IN (SELECT id FROM public.bookmakers WHERE projeto_id = p_projeto_id)
      AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
      AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts);

    SELECT COALESCE(SUM(
      -public.convert_to_target_currency(COALESCE(pp.valor, 0), COALESCE(b.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
    ), 0)
    INTO v_lucro_perdas_operacionais
    FROM public.projeto_perdas pp
    LEFT JOIN public.bookmakers b ON b.id = pp.bookmaker_id
    WHERE pp.projeto_id = p_projeto_id
      AND pp.status = 'CONFIRMADA'
      AND COALESCE(pp.valor, 0) > 0
      AND (v_start_ts IS NULL OR pp.data_registro >= v_start_ts)
      AND (v_end_ts IS NULL OR pp.data_registro <= v_end_ts);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('dia', sub.dia, 'lucro', sub.lucro, 'qtd', sub.qtd)
      ORDER BY sub.dia
    ),
    '[]'::jsonb
  )
  INTO v_daily
  FROM (
    SELECT merged.dia, SUM(merged.lucro) AS lucro, SUM(merged.qtd)::bigint AS qtd
    FROM (
      SELECT
        (au.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
        SUM(
          CASE
            WHEN au.pl_consolidado IS NOT NULL AND au.consolidation_currency = v_moeda_consolidacao THEN au.pl_consolidado
            ELSE public.convert_to_target_currency(COALESCE(au.lucro_prejuizo, 0), COALESCE(au.moeda_operacao, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
          END
        ) AS lucro,
        SUM(CASE WHEN au.forma_registro = 'ARBITRAGEM' THEN COALESCE(pc.pernas_count, 1) ELSE 1 END)::bigint AS qtd
      FROM public.apostas_unificada au
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS pernas_count
        FROM public.apostas_pernas ap2
        WHERE ap2.aposta_id = au.id
      ) pc ON au.forma_registro = 'ARBITRAGEM'
      WHERE au.projeto_id = p_projeto_id
        AND au.cancelled_at IS NULL
        AND au.status = 'LIQUIDADA'
        AND (v_start_ts IS NULL OR au.data_aposta >= v_start_ts)
        AND (v_end_ts IS NULL OR au.data_aposta <= v_end_ts)
        AND (p_estrategia IS NULL OR au.estrategia = p_estrategia)
      GROUP BY (au.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date

      UNION ALL

      SELECT cb.data_credito::text AS dia,
             SUM(public.convert_to_target_currency(COALESCE(cb.valor, 0), COALESCE(cb.moeda_operacao, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)) AS lucro,
             0::bigint AS qtd
      FROM public.cashback_manual cb
      WHERE p_estrategia IS NULL
        AND cb.projeto_id = p_projeto_id
        AND (p_data_inicio IS NULL OR cb.data_credito >= p_data_inicio::date)
        AND (p_data_fim IS NULL OR cb.data_credito <= p_data_fim::date)
      GROUP BY cb.data_credito

      UNION ALL

      SELECT (gg.data_registro AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
             SUM(public.convert_to_target_currency(COALESCE(gg.valor_retorno, 0), COALESCE(b.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)) AS lucro,
             0::bigint AS qtd
      FROM public.giros_gratis gg
      LEFT JOIN public.bookmakers b ON b.id = gg.bookmaker_id
      WHERE p_estrategia IS NULL
        AND gg.projeto_id = p_projeto_id
        AND gg.status = 'CONFIRMADO'
        AND gg.valor_retorno IS NOT NULL
        AND (v_start_ts IS NULL OR gg.data_registro >= v_start_ts)
        AND (v_end_ts IS NULL OR gg.data_registro <= v_end_ts)
      GROUP BY (gg.data_registro AT TIME ZONE 'America/Sao_Paulo')::date

      UNION ALL

      SELECT (bl.credited_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
             SUM(public.convert_to_target_currency(COALESCE(bl.bonus_amount, 0), COALESCE(bl.currency, b.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)) AS lucro,
             0::bigint AS qtd
      FROM public.project_bookmaker_link_bonuses bl
      LEFT JOIN public.bookmakers b ON b.id = bl.bookmaker_id
      WHERE p_estrategia IS NULL
        AND bl.project_id = p_projeto_id
        AND bl.status IN ('credited', 'finalized')
        AND bl.credited_at IS NOT NULL
        AND (bl.tipo_bonus IS NULL OR bl.tipo_bonus != 'FREEBET')
        AND COALESCE(bl.bonus_amount, 0) > 0
        AND (v_start_ts IS NULL OR bl.credited_at >= v_start_ts)
        AND (v_end_ts IS NULL OR bl.credited_at <= v_end_ts)
      GROUP BY (bl.credited_at AT TIME ZONE 'America/Sao_Paulo')::date

      UNION ALL

      SELECT (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
             SUM(public.convert_to_target_currency(COALESCE(cl.valor, 0), COALESCE(cl.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)) AS lucro,
             0::bigint AS qtd
      FROM public.cash_ledger cl
      WHERE p_estrategia IS NULL
        AND cl.status = 'CONFIRMADO'
        AND cl.tipo_transacao IN ('FREEBET_CONVERTIDA', 'CREDITO_PROMOCIONAL', 'GIRO_GRATIS_GANHO')
        AND cl.destino_bookmaker_id IN (SELECT id FROM public.bookmakers WHERE projeto_id = p_projeto_id)
        AND COALESCE(cl.valor, 0) > 0
        AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
        AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
      GROUP BY (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date

      UNION ALL

      SELECT (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
             SUM(CASE
               WHEN cl.ajuste_direcao = 'SAIDA' THEN -public.convert_to_target_currency(COALESCE(cl.valor, 0), COALESCE(cl.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
               ELSE public.convert_to_target_currency(COALESCE(cl.valor, 0), COALESCE(cl.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
             END) AS lucro,
             0::bigint AS qtd
      FROM public.cash_ledger cl
      WHERE p_estrategia IS NULL
        AND cl.status = 'CONFIRMADO'
        AND cl.tipo_transacao = 'AJUSTE_SALDO'
        AND cl.projeto_id_snapshot = p_projeto_id
        AND COALESCE(cl.valor, 0) != 0
        AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
        AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
      GROUP BY (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date

      UNION ALL

      SELECT (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
             SUM(CASE
               WHEN cl.tipo_transacao = 'PERDA_CAMBIAL' THEN -public.convert_to_target_currency(COALESCE(cl.valor, 0), COALESCE(cl.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
               ELSE public.convert_to_target_currency(COALESCE(cl.valor, 0), COALESCE(cl.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)
             END) AS lucro,
             0::bigint AS qtd
      FROM public.cash_ledger cl
      WHERE p_estrategia IS NULL
        AND cl.status = 'CONFIRMADO'
        AND cl.tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL')
        AND cl.projeto_id_snapshot = p_projeto_id
        AND COALESCE(cl.valor, 0) != 0
        AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
        AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
      GROUP BY (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date

      UNION ALL

      SELECT (ba.created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
             SUM(public.convert_to_target_currency(COALESCE(ba.diferenca, 0), COALESCE(b.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)) AS lucro,
             0::bigint AS qtd
      FROM public.bookmaker_balance_audit ba
      JOIN public.bookmakers b ON b.id = ba.bookmaker_id
      WHERE p_estrategia IS NULL
        AND ba.origem = 'CONCILIACAO_VINCULO'
        AND ba.referencia_tipo = 'projeto'
        AND ba.referencia_id = p_projeto_id
        AND COALESCE(ba.diferenca, 0) != 0
        AND (v_start_ts IS NULL OR ba.created_at >= v_start_ts)
        AND (v_end_ts IS NULL OR ba.created_at <= v_end_ts)
      GROUP BY (ba.created_at AT TIME ZONE 'America/Sao_Paulo')::date

      UNION ALL

      SELECT (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
             SUM(-public.convert_to_target_currency(
               COALESCE((cl.auditoria_metadata::jsonb ->> 'valor_perdido')::numeric, cl.valor, 0),
               COALESCE(cl.moeda, 'BRL'),
               v_moeda_consolidacao,
               v_cotacao,
               p_cotacoes
             )) AS lucro,
             0::bigint AS qtd
      FROM public.cash_ledger cl
      WHERE p_estrategia IS NULL
        AND cl.ajuste_motivo = 'BONUS_CANCELAMENTO'
        AND cl.ajuste_direcao = 'SAIDA'
        AND cl.origem_bookmaker_id IN (SELECT id FROM public.bookmakers WHERE projeto_id = p_projeto_id)
        AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
        AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
      GROUP BY (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date

      UNION ALL

      SELECT (pp.data_registro AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
             SUM(-public.convert_to_target_currency(COALESCE(pp.valor, 0), COALESCE(b.moeda, 'BRL'), v_moeda_consolidacao, v_cotacao, p_cotacoes)) AS lucro,
             0::bigint AS qtd
      FROM public.projeto_perdas pp
      LEFT JOIN public.bookmakers b ON b.id = pp.bookmaker_id
      WHERE p_estrategia IS NULL
        AND pp.projeto_id = p_projeto_id
        AND pp.status = 'CONFIRMADA'
        AND COALESCE(pp.valor, 0) > 0
        AND (v_start_ts IS NULL OR pp.data_registro >= v_start_ts)
        AND (v_end_ts IS NULL OR pp.data_registro <= v_end_ts)
      GROUP BY (pp.data_registro AT TIME ZONE 'America/Sao_Paulo')::date
    ) merged
    GROUP BY merged.dia
  ) sub;

  v_result := jsonb_build_object(
    'total_apostas', v_nao_arb_count + v_pernas_count,
    'apostas_pendentes', v_pendentes,
    'greens', v_greens + v_pernas_greens,
    'reds', v_reds + v_pernas_reds,
    'voids', v_voids + v_pernas_voids,
    'meio_greens', v_meio_greens + v_pernas_meio_greens,
    'meio_reds', v_meio_reds + v_pernas_meio_reds,
    'total_stake', v_total_stake_nao_arb + v_total_stake_pernas,
    'lucro_apostas', v_lucro_apostas,
    'lucro_cashback', v_lucro_cashback,
    'lucro_giros', v_lucro_giros,
    'lucro_bonus', v_lucro_bonus,
    'lucro_promocionais', v_lucro_promocionais,
    'lucro_ajustes', v_lucro_ajustes,
    'lucro_resultado_cambial', v_lucro_resultado_cambial,
    'lucro_conciliacoes', v_lucro_conciliacoes,
    'lucro_perdas_cancelamento', v_lucro_perdas_cancelamento,
    'lucro_perdas_operacionais', v_lucro_perdas_operacionais,
    'lucro_total', v_lucro_apostas + v_lucro_cashback + v_lucro_giros + v_lucro_bonus + v_lucro_promocionais + v_lucro_ajustes + v_lucro_resultado_cambial + v_lucro_conciliacoes + v_lucro_perdas_cancelamento + v_lucro_perdas_operacionais,
    'daily', v_daily
  );

  RETURN v_result;
END;
$function$;