
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
  v_resumo jsonb;
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
BEGIN
  -- Validate token
  SELECT * INTO v_link
  FROM projeto_shared_links
  WHERE token = p_token
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'INVALID_TOKEN');
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'EXPIRED_TOKEN');
  END IF;

  -- Update view count
  UPDATE projeto_shared_links
  SET view_count = view_count + 1,
      last_viewed_at = now()
  WHERE id = v_link.id;

  -- Fetch project
  SELECT * INTO v_projeto
  FROM projetos
  WHERE id = v_link.projeto_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'PROJECT_NOT_FOUND');
  END IF;

  v_moeda_consolidacao := COALESCE(v_projeto.moeda_consolidacao, 'BRL');
  v_cotacao := COALESCE(v_projeto.cotacao_trabalho, 5.0);

  -- ══════════════════════════════════════════════════════════════
  -- CONTAGEM + RESULTADOS de apostas não-arbitragem
  -- ══════════════════════════════════════════════════════════════
  SELECT
    COUNT(*) FILTER (WHERE forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'GREEN' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'RED' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'VOID' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE status = 'PENDENTE'),
    -- Stake with currency conversion
    COALESCE(SUM(CASE 
      WHEN forma_registro != 'ARBITRAGEM' THEN 
        CASE
          WHEN stake_consolidado IS NOT NULL THEN stake_consolidado
          WHEN COALESCE(moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(stake, 0)
          WHEN COALESCE(moeda_operacao, 'BRL') IN ('USD', 'USDT', 'USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(stake, 0) * v_cotacao
          WHEN COALESCE(moeda_operacao, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD', 'USDT', 'USDC') THEN COALESCE(stake, 0) / v_cotacao
          WHEN COALESCE(moeda_operacao, 'BRL') IN ('EUR') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(stake, 0) * v_cotacao * 1.08
          ELSE COALESCE(stake, 0)
        END
      ELSE 0
    END), 0),
    -- Lucro with full currency conversion
    COALESCE(SUM(
      CASE
        WHEN pl_consolidado IS NOT NULL AND consolidation_currency = v_moeda_consolidacao THEN pl_consolidado
        WHEN lucro_prejuizo_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN lucro_prejuizo_brl_referencia
        WHEN COALESCE(moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(lucro_prejuizo, 0)
        WHEN COALESCE(moeda_operacao, 'BRL') IN ('USD', 'USDT', 'USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(lucro_prejuizo, 0) * v_cotacao
        WHEN COALESCE(moeda_operacao, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD', 'USDT', 'USDC') THEN COALESCE(lucro_prejuizo, 0) / v_cotacao
        WHEN COALESCE(moeda_operacao, 'BRL') IN ('EUR') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(lucro_prejuizo, 0) * v_cotacao * 1.08
        ELSE COALESCE(lucro_prejuizo, 0)
      END
    ), 0)
  INTO v_nao_arb_count, v_greens, v_reds, v_voids, v_pendentes, v_total_stake, v_lucro_apostas
  FROM apostas_unificada
  WHERE projeto_id = v_link.projeto_id
    AND cancelled_at IS NULL;

  -- ══════════════════════════════════════════════════════════════
  -- PERNAS de arbitragem
  -- ══════════════════════════════════════════════════════════════
  SELECT
    COUNT(*),
    COALESCE(SUM(
      CASE
        WHEN ap.stake_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN ap.stake_brl_referencia
        WHEN ap.moeda = v_moeda_consolidacao THEN ap.stake
        WHEN ap.moeda IN ('USD', 'USDT', 'USDC') AND v_moeda_consolidacao = 'BRL' THEN ap.stake * v_cotacao
        WHEN ap.moeda = 'BRL' AND v_moeda_consolidacao IN ('USD', 'USDT', 'USDC') THEN ap.stake / v_cotacao
        ELSE ap.stake
      END
    ), 0)
  INTO v_pernas_count, v_total_stake_pernas
  FROM apostas_pernas ap
  JOIN apostas_unificada au ON ap.aposta_id = au.id
  WHERE au.projeto_id = v_link.projeto_id
    AND au.cancelled_at IS NULL
    AND au.forma_registro = 'ARBITRAGEM';

  -- ══════════════════════════════════════════════════════════════
  -- LUCRO DIÁRIO (calendário) com conversão multimoeda
  -- ══════════════════════════════════════════════════════════════
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('dia', sub.dia, 'lucro', sub.lucro, 'qtd', sub.qtd) ORDER BY sub.dia
  ), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT
      (au.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
      SUM(
        CASE
          WHEN au.pl_consolidado IS NOT NULL AND au.consolidation_currency = v_moeda_consolidacao THEN au.pl_consolidado
          WHEN au.lucro_prejuizo_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN au.lucro_prejuizo_brl_referencia
          WHEN COALESCE(au.moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(au.lucro_prejuizo, 0)
          WHEN COALESCE(au.moeda_operacao, 'BRL') IN ('USD', 'USDT', 'USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(au.lucro_prejuizo, 0) * v_cotacao
          WHEN COALESCE(au.moeda_operacao, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD', 'USDT', 'USDC') THEN COALESCE(au.lucro_prejuizo, 0) / v_cotacao
          ELSE COALESCE(au.lucro_prejuizo, 0)
        END
      ) AS lucro,
      SUM(CASE 
        WHEN au.forma_registro = 'ARBITRAGEM' THEN COALESCE(pc.pernas_count, 1)
        ELSE 1
      END)::bigint AS qtd
    FROM apostas_unificada au
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS pernas_count
      FROM apostas_pernas ap2
      WHERE ap2.aposta_id = au.id
    ) pc ON au.forma_registro = 'ARBITRAGEM'
    WHERE au.projeto_id = v_link.projeto_id
      AND au.cancelled_at IS NULL
      AND au.status = 'LIQUIDADA'
    GROUP BY (au.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date
  ) sub;

  -- ══════════════════════════════════════════════════════════════
  -- RESULTADO FINAL
  -- ══════════════════════════════════════════════════════════════
  v_resumo := jsonb_build_object(
    'total_apostas', v_nao_arb_count + v_pernas_count,
    'greens', v_greens,
    'reds', v_reds,
    'voids', v_voids,
    'lucro_total', v_lucro_apostas,
    'total_stake', v_total_stake + v_total_stake_pernas,
    'apostas_pendentes', v_pendentes
  );

  RETURN jsonb_build_object(
    'projeto', jsonb_build_object(
      'id', v_projeto.id,
      'nome', v_projeto.nome,
      'moeda_consolidacao', v_moeda_consolidacao,
      'created_at', v_projeto.created_at
    ),
    'resumo', v_resumo,
    'daily', v_daily
  );
END;
$$;
