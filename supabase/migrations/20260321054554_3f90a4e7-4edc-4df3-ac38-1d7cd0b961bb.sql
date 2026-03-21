
CREATE OR REPLACE FUNCTION public.get_shared_project_data(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link projeto_shared_links%ROWTYPE;
  v_projeto projetos%ROWTYPE;
  v_daily jsonb;
  v_moeda_consolidacao text;
  v_cotacao numeric;
  v_nao_arb_count bigint;
  v_pernas_count bigint := 0;
  v_greens bigint;
  v_reds bigint;
  v_voids bigint;
  v_pendentes bigint;
  v_total_stake numeric := 0;
  v_total_stake_pernas numeric := 0;
  v_lucro_apostas numeric := 0;
  v_lucro_cashback numeric := 0;
  v_lucro_giros numeric := 0;
  v_lucro_bonus numeric := 0;
  v_lucro_ajustes numeric := 0;
  v_lucro_total numeric := 0;
BEGIN
  SELECT * INTO v_link
  FROM public.projeto_shared_links
  WHERE token = p_token
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'INVALID_TOKEN');
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'EXPIRED_TOKEN');
  END IF;

  UPDATE public.projeto_shared_links
  SET view_count = COALESCE(view_count, 0) + 1,
      last_viewed_at = now()
  WHERE id = v_link.id;

  SELECT * INTO v_projeto
  FROM public.projetos
  WHERE id = v_link.projeto_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'PROJECT_NOT_FOUND');
  END IF;

  v_moeda_consolidacao := COALESCE(v_projeto.moeda_consolidacao, 'BRL');
  v_cotacao := COALESCE(v_projeto.cotacao_trabalho, 5.0);

  -- Contagem e lucro de apostas (não-arb)
  SELECT
    COUNT(*) FILTER (WHERE forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'GREEN' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'RED' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'VOID' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE status = 'PENDENTE'),
    COALESCE(SUM(CASE 
      WHEN forma_registro != 'ARBITRAGEM' THEN 
        CASE
          WHEN stake_consolidado IS NOT NULL THEN stake_consolidado
          WHEN COALESCE(moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(stake, 0)
          WHEN COALESCE(moeda_operacao, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(stake, 0) * v_cotacao
          WHEN COALESCE(moeda_operacao, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN COALESCE(stake, 0) / v_cotacao
          ELSE COALESCE(stake, 0)
        END
      ELSE 0
    END), 0),
    COALESCE(SUM(
      CASE
        WHEN pl_consolidado IS NOT NULL AND consolidation_currency = v_moeda_consolidacao THEN pl_consolidado
        WHEN lucro_prejuizo_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN lucro_prejuizo_brl_referencia
        WHEN COALESCE(moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(lucro_prejuizo, 0)
        WHEN COALESCE(moeda_operacao, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(lucro_prejuizo, 0) * v_cotacao
        WHEN COALESCE(moeda_operacao, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN COALESCE(lucro_prejuizo, 0) / v_cotacao
        ELSE COALESCE(lucro_prejuizo, 0)
      END
    ), 0)
  INTO v_nao_arb_count, v_greens, v_reds, v_voids, v_pendentes, v_total_stake, v_lucro_apostas
  FROM public.apostas_unificada
  WHERE projeto_id = v_link.projeto_id
    AND cancelled_at IS NULL;

  -- Pernas de arbitragem
  SELECT
    COUNT(*),
    COALESCE(SUM(
      CASE
        WHEN ap.stake_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN ap.stake_brl_referencia
        WHEN ap.moeda = v_moeda_consolidacao THEN ap.stake
        WHEN ap.moeda IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN ap.stake * v_cotacao
        WHEN ap.moeda = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN ap.stake / v_cotacao
        ELSE ap.stake
      END
    ), 0)
  INTO v_pernas_count, v_total_stake_pernas
  FROM public.apostas_pernas ap
  JOIN public.apostas_unificada au ON ap.aposta_id = au.id
  WHERE au.projeto_id = v_link.projeto_id
    AND au.cancelled_at IS NULL
    AND au.forma_registro = 'ARBITRAGEM';

  -- Cashback
  SELECT COALESCE(SUM(
    CASE 
      WHEN valor_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN valor_brl_referencia
      WHEN COALESCE(moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(valor, 0)
      WHEN COALESCE(moeda_operacao, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(valor, 0) * v_cotacao
      WHEN COALESCE(moeda_operacao, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN COALESCE(valor, 0) / v_cotacao
      ELSE COALESCE(valor, 0)
    END
  ), 0)
  INTO v_lucro_cashback
  FROM public.cashback_manual
  WHERE projeto_id = v_link.projeto_id;

  -- Giros grátis
  SELECT COALESCE(SUM(COALESCE(valor_retorno, 0)), 0)
  INTO v_lucro_giros
  FROM public.giros_gratis
  WHERE projeto_id = v_link.projeto_id
    AND status = 'CONFIRMADO';

  -- Bônus
  SELECT COALESCE(SUM(
    CASE
      WHEN COALESCE(b.currency, 'BRL') = v_moeda_consolidacao THEN COALESCE(b.bonus_amount, 0)
      WHEN COALESCE(b.currency, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(b.bonus_amount, 0) * v_cotacao
      WHEN COALESCE(b.currency, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN COALESCE(b.bonus_amount, 0) / v_cotacao
      ELSE COALESCE(b.bonus_amount, 0)
    END
  ), 0)
  INTO v_lucro_bonus
  FROM public.project_bookmaker_link_bonuses b
  WHERE b.project_id = v_link.projeto_id
    AND b.status IN ('credited', 'finalized');

  -- Ajustes
  SELECT COALESCE(SUM(
    CASE
      WHEN cl.ajuste_direcao = 'CREDITO' THEN
        CASE
          WHEN COALESCE(cl.moeda, 'BRL') = v_moeda_consolidacao THEN cl.valor
          WHEN COALESCE(cl.moeda, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN cl.valor * v_cotacao
          WHEN COALESCE(cl.moeda, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN cl.valor / v_cotacao
          ELSE cl.valor
        END
      WHEN cl.ajuste_direcao = 'DEBITO' THEN
        CASE
          WHEN COALESCE(cl.moeda, 'BRL') = v_moeda_consolidacao THEN -cl.valor
          WHEN COALESCE(cl.moeda, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN -cl.valor * v_cotacao
          WHEN COALESCE(cl.moeda, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN -cl.valor / v_cotacao
          ELSE -cl.valor
        END
      ELSE 0
    END
  ), 0)
  INTO v_lucro_ajustes
  FROM public.cash_ledger cl
  WHERE cl.projeto_id_snapshot = v_link.projeto_id
    AND cl.status = 'CONFIRMADO'
    AND cl.tipo_transacao = 'AJUSTE_RECONCILIACAO';

  v_lucro_total := v_lucro_apostas + v_lucro_cashback + v_lucro_giros + v_lucro_bonus + v_lucro_ajustes;

  -- Daily: TODOS os módulos financeiros (Visão Geral completa)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('dia', sub.dia, 'lucro', sub.lucro, 'qtd', sub.qtd)
    ORDER BY sub.dia
  ), '[]'::jsonb)
  INTO v_daily
  FROM (
    -- Apostas liquidadas
    SELECT
      (au.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
      SUM(
        CASE
          WHEN au.pl_consolidado IS NOT NULL AND au.consolidation_currency = v_moeda_consolidacao THEN au.pl_consolidado
          WHEN au.lucro_prejuizo_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN au.lucro_prejuizo_brl_referencia
          WHEN COALESCE(au.moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(au.lucro_prejuizo, 0)
          WHEN COALESCE(au.moeda_operacao, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(au.lucro_prejuizo, 0) * v_cotacao
          WHEN COALESCE(au.moeda_operacao, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN COALESCE(au.lucro_prejuizo, 0) / v_cotacao
          ELSE COALESCE(au.lucro_prejuizo, 0)
        END
      ) AS lucro,
      SUM(CASE WHEN au.forma_registro = 'ARBITRAGEM' THEN COALESCE(pc.pernas_count, 1) ELSE 1 END)::bigint AS qtd
    FROM public.apostas_unificada au
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS pernas_count
      FROM public.apostas_pernas ap2
      WHERE ap2.aposta_id = au.id
    ) pc ON au.forma_registro = 'ARBITRAGEM'
    WHERE au.projeto_id = v_link.projeto_id
      AND au.cancelled_at IS NULL
      AND au.status = 'LIQUIDADA'
    GROUP BY (au.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date

    UNION ALL

    -- Cashback por data_competencia
    SELECT
      COALESCE(cm.data_competencia, cm.created_at::date)::text AS dia,
      SUM(
        CASE
          WHEN cm.valor_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN cm.valor_brl_referencia
          WHEN COALESCE(cm.moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(cm.valor, 0)
          WHEN COALESCE(cm.moeda_operacao, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(cm.valor, 0) * v_cotacao
          WHEN COALESCE(cm.moeda_operacao, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN COALESCE(cm.valor, 0) / v_cotacao
          ELSE COALESCE(cm.valor, 0)
        END
      ) AS lucro,
      0::bigint AS qtd
    FROM public.cashback_manual cm
    WHERE cm.projeto_id = v_link.projeto_id
    GROUP BY COALESCE(cm.data_competencia, cm.created_at::date)

    UNION ALL

    -- Giros grátis confirmados
    SELECT
      COALESCE(gg.data_registro, gg.created_at)::date::text AS dia,
      SUM(COALESCE(gg.valor_retorno, 0)) AS lucro,
      0::bigint AS qtd
    FROM public.giros_gratis gg
    WHERE gg.projeto_id = v_link.projeto_id
      AND gg.status = 'CONFIRMADO'
    GROUP BY COALESCE(gg.data_registro, gg.created_at)::date

    UNION ALL

    -- Bônus creditados
    SELECT
      COALESCE(b.credited_at, b.created_at)::date::text AS dia,
      SUM(
        CASE
          WHEN COALESCE(b.currency, 'BRL') = v_moeda_consolidacao THEN COALESCE(b.bonus_amount, 0)
          WHEN COALESCE(b.currency, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(b.bonus_amount, 0) * v_cotacao
          WHEN COALESCE(b.currency, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN COALESCE(b.bonus_amount, 0) / v_cotacao
          ELSE COALESCE(b.bonus_amount, 0)
        END
      ) AS lucro,
      0::bigint AS qtd
    FROM public.project_bookmaker_link_bonuses b
    WHERE b.project_id = v_link.projeto_id
      AND b.status IN ('credited', 'finalized')
    GROUP BY COALESCE(b.credited_at, b.created_at)::date

    UNION ALL

    -- Ajustes (cash_ledger)
    SELECT
      (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
      SUM(
        CASE
          WHEN cl.ajuste_direcao = 'CREDITO' THEN
            CASE
              WHEN COALESCE(cl.moeda, 'BRL') = v_moeda_consolidacao THEN cl.valor
              WHEN COALESCE(cl.moeda, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN cl.valor * v_cotacao
              WHEN COALESCE(cl.moeda, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN cl.valor / v_cotacao
              ELSE cl.valor
            END
          WHEN cl.ajuste_direcao = 'DEBITO' THEN
            CASE
              WHEN COALESCE(cl.moeda, 'BRL') = v_moeda_consolidacao THEN -cl.valor
              WHEN COALESCE(cl.moeda, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN -cl.valor * v_cotacao
              WHEN COALESCE(cl.moeda, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN -cl.valor / v_cotacao
              ELSE -cl.valor
            END
          ELSE 0
        END
      ) AS lucro,
      0::bigint AS qtd
    FROM public.cash_ledger cl
    WHERE cl.projeto_id_snapshot = v_link.projeto_id
      AND cl.status = 'CONFIRMADO'
      AND cl.tipo_transacao = 'AJUSTE_RECONCILIACAO'
    GROUP BY (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date
  ) sub_all
  -- Reagregar por dia (merge de módulos no mesmo dia)
  JOIN LATERAL (
    SELECT sub_all.dia, SUM(sub_all.lucro) AS lucro, SUM(sub_all.qtd) AS qtd
  ) sub ON true;

  -- Fix: need to re-aggregate properly
  -- The UNION ALL gives multiple rows per dia, need final GROUP BY
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('dia', agg.dia, 'lucro', agg.lucro, 'qtd', agg.qtd)
    ORDER BY agg.dia
  ), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT dia, SUM(lucro) AS lucro, SUM(qtd) AS qtd
    FROM (
      -- Apostas liquidadas
      SELECT
        (au.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
        SUM(
          CASE
            WHEN au.pl_consolidado IS NOT NULL AND au.consolidation_currency = v_moeda_consolidacao THEN au.pl_consolidado
            WHEN au.lucro_prejuizo_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN au.lucro_prejuizo_brl_referencia
            WHEN COALESCE(au.moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(au.lucro_prejuizo, 0)
            WHEN COALESCE(au.moeda_operacao, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(au.lucro_prejuizo, 0) * v_cotacao
            WHEN COALESCE(au.moeda_operacao, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN COALESCE(au.lucro_prejuizo, 0) / v_cotacao
            ELSE COALESCE(au.lucro_prejuizo, 0)
          END
        ) AS lucro,
        SUM(CASE WHEN au.forma_registro = 'ARBITRAGEM' THEN COALESCE(pc.pernas_count, 1) ELSE 1 END)::bigint AS qtd
      FROM public.apostas_unificada au
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS pernas_count
        FROM public.apostas_pernas ap2
        WHERE ap2.aposta_id = au.id
      ) pc ON au.forma_registro = 'ARBITRAGEM'
      WHERE au.projeto_id = v_link.projeto_id
        AND au.cancelled_at IS NULL
        AND au.status = 'LIQUIDADA'
      GROUP BY (au.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date

      UNION ALL

      -- Cashback
      SELECT
        COALESCE(cm.data_competencia, cm.created_at::date)::text AS dia,
        SUM(
          CASE
            WHEN cm.valor_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN cm.valor_brl_referencia
            WHEN COALESCE(cm.moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(cm.valor, 0)
            WHEN COALESCE(cm.moeda_operacao, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(cm.valor, 0) * v_cotacao
            WHEN COALESCE(cm.moeda_operacao, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN COALESCE(cm.valor, 0) / v_cotacao
            ELSE COALESCE(cm.valor, 0)
          END
        ) AS lucro,
        0::bigint AS qtd
      FROM public.cashback_manual cm
      WHERE cm.projeto_id = v_link.projeto_id
      GROUP BY COALESCE(cm.data_competencia, cm.created_at::date)

      UNION ALL

      -- Giros grátis
      SELECT
        COALESCE(gg.data_registro, gg.created_at)::date::text AS dia,
        SUM(COALESCE(gg.valor_retorno, 0)) AS lucro,
        0::bigint AS qtd
      FROM public.giros_gratis gg
      WHERE gg.projeto_id = v_link.projeto_id
        AND gg.status = 'CONFIRMADO'
      GROUP BY COALESCE(gg.data_registro, gg.created_at)::date

      UNION ALL

      -- Bônus
      SELECT
        COALESCE(b.credited_at, b.created_at)::date::text AS dia,
        SUM(
          CASE
            WHEN COALESCE(b.currency, 'BRL') = v_moeda_consolidacao THEN COALESCE(b.bonus_amount, 0)
            WHEN COALESCE(b.currency, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(b.bonus_amount, 0) * v_cotacao
            WHEN COALESCE(b.currency, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN COALESCE(b.bonus_amount, 0) / v_cotacao
            ELSE COALESCE(b.bonus_amount, 0)
          END
        ) AS lucro,
        0::bigint AS qtd
      FROM public.project_bookmaker_link_bonuses b
      WHERE b.project_id = v_link.projeto_id
        AND b.status IN ('credited', 'finalized')
      GROUP BY COALESCE(b.credited_at, b.created_at)::date

      UNION ALL

      -- Ajustes
      SELECT
        (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
        SUM(
          CASE
            WHEN cl.ajuste_direcao = 'CREDITO' THEN
              CASE
                WHEN COALESCE(cl.moeda, 'BRL') = v_moeda_consolidacao THEN cl.valor
                WHEN COALESCE(cl.moeda, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN cl.valor * v_cotacao
                WHEN COALESCE(cl.moeda, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN cl.valor / v_cotacao
                ELSE cl.valor
              END
            WHEN cl.ajuste_direcao = 'DEBITO' THEN
              CASE
                WHEN COALESCE(cl.moeda, 'BRL') = v_moeda_consolidacao THEN -cl.valor
                WHEN COALESCE(cl.moeda, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN -cl.valor * v_cotacao
                WHEN COALESCE(cl.moeda, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN -cl.valor / v_cotacao
                ELSE -cl.valor
              END
            ELSE 0
          END
        ) AS lucro,
        0::bigint AS qtd
      FROM public.cash_ledger cl
      WHERE cl.projeto_id_snapshot = v_link.projeto_id
        AND cl.status = 'CONFIRMADO'
        AND cl.tipo_transacao = 'AJUSTE_RECONCILIACAO'
      GROUP BY (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date
    ) all_modules
    GROUP BY dia
  ) agg;

  RETURN jsonb_build_object(
    'projeto', jsonb_build_object(
      'id', v_projeto.id,
      'nome', v_projeto.nome,
      'moeda_consolidacao', v_moeda_consolidacao,
      'created_at', v_projeto.created_at
    ),
    'resumo', jsonb_build_object(
      'total_apostas', v_nao_arb_count + v_pernas_count,
      'greens', v_greens,
      'reds', v_reds,
      'voids', v_voids,
      'lucro_apostas', v_lucro_apostas,
      'lucro_cashback', v_lucro_cashback,
      'lucro_giros', v_lucro_giros,
      'lucro_bonus', v_lucro_bonus,
      'lucro_ajustes', v_lucro_ajustes,
      'lucro_total', v_lucro_total,
      'total_stake', v_total_stake + v_total_stake_pernas,
      'apostas_pendentes', v_pendentes
    ),
    'daily', v_daily
  );
END;
$$;
