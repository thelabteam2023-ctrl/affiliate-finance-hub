
CREATE OR REPLACE FUNCTION public.get_shared_project_data(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_lucro_total numeric := 0;
  v_lucro_operacional_raw jsonb;
  v_mod_data jsonb;
  v_moeda text;
  v_valor numeric;
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

  SELECT * INTO v_projeto
  FROM public.projetos
  WHERE id = v_link.projeto_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'PROJECT_NOT_FOUND');
  END IF;

  v_moeda_consolidacao := COALESCE(v_projeto.moeda_consolidacao, 'BRL');
  v_cotacao := COALESCE(v_projeto.cotacao_trabalho, 5.0);

  -- Contagens de apostas (não muda)
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
    END), 0)
  INTO v_nao_arb_count, v_greens, v_reds, v_voids, v_pendentes, v_total_stake
  FROM public.apostas_unificada
  WHERE projeto_id = v_link.projeto_id
    AND cancelled_at IS NULL;

  -- Pernas count para surebets
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

  -- =========================================================
  -- LUCRO OPERACIONAL: Usar a RPC canônica (mesma da Visão Geral)
  -- Inclui TODOS os 11 módulos: apostas, cashback, giros, bonus,
  -- perdas, conciliacoes, ajustes_saldo, resultado_cambial,
  -- promocionais, perdas_cancelamento
  -- =========================================================
  v_lucro_operacional_raw := get_projetos_lucro_operacional(
    ARRAY[v_link.projeto_id],
    NULL,  -- sem filtro de data (all-time)
    NULL
  );

  -- Extrair dados do projeto
  v_mod_data := v_lucro_operacional_raw -> v_link.projeto_id::text;

  -- Calcular lucro total consolidado a partir dos módulos
  v_lucro_total := 0;

  IF v_mod_data IS NOT NULL THEN
    -- Módulos aditivos
    FOR v_moeda, v_valor IN
      SELECT key, value::numeric FROM jsonb_each_text(COALESCE(v_mod_data -> 'apostas', '{}'::jsonb))
    LOOP
      v_lucro_total := v_lucro_total + CASE
        WHEN v_moeda = v_moeda_consolidacao THEN v_valor
        WHEN v_moeda IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN v_valor * v_cotacao
        WHEN v_moeda = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN v_valor / v_cotacao
        ELSE v_valor
      END;
    END LOOP;

    FOR v_moeda, v_valor IN
      SELECT key, value::numeric FROM jsonb_each_text(COALESCE(v_mod_data -> 'cashback', '{}'::jsonb))
    LOOP
      v_lucro_total := v_lucro_total + CASE
        WHEN v_moeda = v_moeda_consolidacao THEN v_valor
        WHEN v_moeda IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN v_valor * v_cotacao
        WHEN v_moeda = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN v_valor / v_cotacao
        ELSE v_valor
      END;
    END LOOP;

    FOR v_moeda, v_valor IN
      SELECT key, value::numeric FROM jsonb_each_text(COALESCE(v_mod_data -> 'giros', '{}'::jsonb))
    LOOP
      v_lucro_total := v_lucro_total + CASE
        WHEN v_moeda = v_moeda_consolidacao THEN v_valor
        WHEN v_moeda IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN v_valor * v_cotacao
        WHEN v_moeda = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN v_valor / v_cotacao
        ELSE v_valor
      END;
    END LOOP;

    FOR v_moeda, v_valor IN
      SELECT key, value::numeric FROM jsonb_each_text(COALESCE(v_mod_data -> 'bonus', '{}'::jsonb))
    LOOP
      v_lucro_total := v_lucro_total + CASE
        WHEN v_moeda = v_moeda_consolidacao THEN v_valor
        WHEN v_moeda IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN v_valor * v_cotacao
        WHEN v_moeda = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN v_valor / v_cotacao
        ELSE v_valor
      END;
    END LOOP;

    FOR v_moeda, v_valor IN
      SELECT key, value::numeric FROM jsonb_each_text(COALESCE(v_mod_data -> 'conciliacoes', '{}'::jsonb))
    LOOP
      v_lucro_total := v_lucro_total + CASE
        WHEN v_moeda = v_moeda_consolidacao THEN v_valor
        WHEN v_moeda IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN v_valor * v_cotacao
        WHEN v_moeda = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN v_valor / v_cotacao
        ELSE v_valor
      END;
    END LOOP;

    FOR v_moeda, v_valor IN
      SELECT key, value::numeric FROM jsonb_each_text(COALESCE(v_mod_data -> 'ajustes_saldo', '{}'::jsonb))
    LOOP
      v_lucro_total := v_lucro_total + CASE
        WHEN v_moeda = v_moeda_consolidacao THEN v_valor
        WHEN v_moeda IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN v_valor * v_cotacao
        WHEN v_moeda = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN v_valor / v_cotacao
        ELSE v_valor
      END;
    END LOOP;

    FOR v_moeda, v_valor IN
      SELECT key, value::numeric FROM jsonb_each_text(COALESCE(v_mod_data -> 'resultado_cambial', '{}'::jsonb))
    LOOP
      v_lucro_total := v_lucro_total + CASE
        WHEN v_moeda = v_moeda_consolidacao THEN v_valor
        WHEN v_moeda IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN v_valor * v_cotacao
        WHEN v_moeda = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN v_valor / v_cotacao
        ELSE v_valor
      END;
    END LOOP;

    FOR v_moeda, v_valor IN
      SELECT key, value::numeric FROM jsonb_each_text(COALESCE(v_mod_data -> 'promocionais', '{}'::jsonb))
    LOOP
      v_lucro_total := v_lucro_total + CASE
        WHEN v_moeda = v_moeda_consolidacao THEN v_valor
        WHEN v_moeda IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN v_valor * v_cotacao
        WHEN v_moeda = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN v_valor / v_cotacao
        ELSE v_valor
      END;
    END LOOP;

    -- Módulos subtrativos
    FOR v_moeda, v_valor IN
      SELECT key, value::numeric FROM jsonb_each_text(COALESCE(v_mod_data -> 'perdas', '{}'::jsonb))
    LOOP
      v_lucro_total := v_lucro_total - CASE
        WHEN v_moeda = v_moeda_consolidacao THEN v_valor
        WHEN v_moeda IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN v_valor * v_cotacao
        WHEN v_moeda = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN v_valor / v_cotacao
        ELSE v_valor
      END;
    END LOOP;

    FOR v_moeda, v_valor IN
      SELECT key, value::numeric FROM jsonb_each_text(COALESCE(v_mod_data -> 'perdas_cancelamento', '{}'::jsonb))
    LOOP
      v_lucro_total := v_lucro_total - CASE
        WHEN v_moeda = v_moeda_consolidacao THEN v_valor
        WHEN v_moeda IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN v_valor * v_cotacao
        WHEN v_moeda = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN v_valor / v_cotacao
        ELSE v_valor
      END;
    END LOOP;
  END IF;

  -- Daily: usar get_projeto_lucro_operacional_daily se disponível,
  -- senão manter a lógica existente com todos os módulos
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('dia', agg.dia, 'lucro', agg.lucro, 'qtd', agg.qtd)
    ORDER BY agg.dia
  ), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT dia, SUM(lucro) AS lucro, SUM(qtd) AS qtd
    FROM (
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

      SELECT
        COALESCE(cm.data_credito, cm.created_at::date)::text AS dia,
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
      GROUP BY COALESCE(cm.data_credito, cm.created_at::date)

      UNION ALL

      SELECT
        COALESCE(gg.data_registro, gg.created_at)::date::text AS dia,
        SUM(COALESCE(gg.valor_retorno, 0)) AS lucro,
        0::bigint AS qtd
      FROM public.giros_gratis gg
      WHERE gg.projeto_id = v_link.projeto_id
        AND gg.status = 'CONFIRMADO'
      GROUP BY COALESCE(gg.data_registro, gg.created_at)::date

      UNION ALL

      SELECT
        COALESCE(b.credited_at, b.finalized_at, b.created_at)::date::text AS dia,
        SUM(
          CASE
            WHEN b.valor_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN b.valor_brl_referencia
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
      GROUP BY COALESCE(b.credited_at, b.finalized_at, b.created_at)::date

      UNION ALL

      -- Ajustes de saldo (AJUSTE_SALDO + AJUSTE_RECONCILIACAO)
      SELECT
        (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
        SUM(
          CASE
            WHEN cl.tipo_transacao = 'AJUSTE_SALDO' THEN
              CASE WHEN cl.ajuste_direcao = 'SAIDA' THEN -1 ELSE 1 END *
              CASE
                WHEN COALESCE(cl.moeda, 'BRL') = v_moeda_consolidacao THEN cl.valor
                WHEN COALESCE(cl.moeda, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN cl.valor * v_cotacao
                WHEN COALESCE(cl.moeda, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN cl.valor / v_cotacao
                ELSE cl.valor
              END
            WHEN cl.tipo_transacao = 'AJUSTE_RECONCILIACAO' THEN
              CASE WHEN cl.ajuste_direcao = 'CREDITO' THEN 1 ELSE -1 END *
              CASE
                WHEN COALESCE(cl.moeda, 'BRL') = v_moeda_consolidacao THEN cl.valor
                WHEN COALESCE(cl.moeda, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN cl.valor * v_cotacao
                WHEN COALESCE(cl.moeda, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN cl.valor / v_cotacao
                ELSE cl.valor
              END
            ELSE 0
          END
        ) AS lucro,
        0::bigint AS qtd
      FROM public.cash_ledger cl
      WHERE cl.projeto_id_snapshot = v_link.projeto_id
        AND cl.status = 'CONFIRMADO'
        AND cl.tipo_transacao IN ('AJUSTE_SALDO', 'AJUSTE_RECONCILIACAO')
      GROUP BY (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date

      UNION ALL

      -- Resultado cambial
      SELECT
        (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
        SUM(
          CASE WHEN cl.tipo_transacao = 'PERDA_CAMBIAL' THEN -1 ELSE 1 END *
          CASE
            WHEN COALESCE(cl.moeda, 'BRL') = v_moeda_consolidacao THEN cl.valor
            WHEN COALESCE(cl.moeda, 'BRL') IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN cl.valor * v_cotacao
            WHEN COALESCE(cl.moeda, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN cl.valor / v_cotacao
            ELSE cl.valor
          END
        ) AS lucro,
        0::bigint AS qtd
      FROM public.cash_ledger cl
      WHERE cl.projeto_id_snapshot = v_link.projeto_id
        AND cl.status = 'CONFIRMADO'
        AND cl.tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL')
      GROUP BY (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date

      UNION ALL

      -- Perdas operacionais
      SELECT
        (pp.data_registro AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
        SUM(
          -COALESCE(pp.valor, 0) *
          CASE
            WHEN UPPER(COALESCE(b.moeda, 'BRL')) = v_moeda_consolidacao THEN 1
            WHEN UPPER(COALESCE(b.moeda, 'BRL')) IN ('USD','USDT','USDC') AND v_moeda_consolidacao = 'BRL' THEN v_cotacao
            WHEN UPPER(COALESCE(b.moeda, 'BRL')) = 'BRL' AND v_moeda_consolidacao IN ('USD','USDT','USDC') THEN 1.0 / v_cotacao
            ELSE 1
          END
        ) AS lucro,
        0::bigint AS qtd
      FROM public.projeto_perdas pp
      LEFT JOIN public.bookmakers b ON b.id = pp.bookmaker_id
      WHERE pp.projeto_id = v_link.projeto_id
        AND pp.status = 'CONFIRMADA'
        AND COALESCE(pp.valor, 0) > 0
      GROUP BY (pp.data_registro AT TIME ZONE 'America/Sao_Paulo')::date
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
      'lucro_apostas', 0,
      'lucro_cashback', 0,
      'lucro_giros', 0,
      'lucro_bonus', 0,
      'lucro_ajustes', 0,
      'lucro_total', v_lucro_total,
      'total_stake', v_total_stake + v_total_stake_pernas,
      'apostas_pendentes', v_pendentes
    ),
    'daily', v_daily
  );
END;
$function$;
