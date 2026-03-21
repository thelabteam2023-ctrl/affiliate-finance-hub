
CREATE OR REPLACE FUNCTION public.get_projeto_apostas_resumo(
  p_projeto_id uuid,
  p_data_inicio text DEFAULT NULL,
  p_data_fim text DEFAULT NULL,
  p_estrategia text DEFAULT NULL,
  p_cotacao_usd numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_daily jsonb;
  v_moeda_consolidacao text;
  v_cotacao numeric;
BEGIN
  -- Fetch project consolidation currency
  -- Use provided cotacao if available, otherwise fall back to cotacao_trabalho
  SELECT p.moeda_consolidacao, 
         COALESCE(p_cotacao_usd, p.cotacao_trabalho, 5.0)
  INTO v_moeda_consolidacao, v_cotacao
  FROM projetos p
  WHERE p.id = p_projeto_id;

  -- Convert date strings to timestamptz with São Paulo timezone
  IF p_data_inicio IS NOT NULL THEN
    v_start_ts := (p_data_inicio || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  END IF;
  IF p_data_fim IS NOT NULL THEN
    v_end_ts := (p_data_fim || ' 23:59:59.999999')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- CONTAGEM + RESULTADOS de apostas não-arbitragem
  -- ══════════════════════════════════════════════════════════════
  SELECT
    COUNT(*) FILTER (WHERE forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'GREEN' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'RED' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'VOID' AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE (resultado = 'MEIO_GREEN' OR resultado = 'HALF') AND forma_registro != 'ARBITRAGEM'),
    COUNT(*) FILTER (WHERE resultado = 'MEIO_RED' AND forma_registro != 'ARBITRAGEM'),
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
    -- Lucro with currency conversion
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
  INTO v_nao_arb_count, v_greens, v_reds, v_voids, v_meio_greens, v_meio_reds, v_pendentes, v_total_stake_nao_arb, v_lucro_apostas
  FROM apostas_unificada
  WHERE projeto_id = p_projeto_id
    AND cancelled_at IS NULL
    AND (v_start_ts IS NULL OR data_aposta >= v_start_ts)
    AND (v_end_ts IS NULL OR data_aposta <= v_end_ts)
    AND (p_estrategia IS NULL OR estrategia = p_estrategia);

  -- ══════════════════════════════════════════════════════════════
  -- PERNAS de arbitragem
  -- ══════════════════════════════════════════════════════════════
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE ap.resultado = 'GREEN'),
    COUNT(*) FILTER (WHERE ap.resultado = 'RED'),
    COUNT(*) FILTER (WHERE ap.resultado = 'VOID'),
    COUNT(*) FILTER (WHERE ap.resultado = 'MEIO_GREEN' OR ap.resultado = 'HALF'),
    COUNT(*) FILTER (WHERE ap.resultado = 'MEIO_RED'),
    COALESCE(SUM(
      CASE
        WHEN ap.stake_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN ap.stake_brl_referencia
        WHEN ap.moeda = v_moeda_consolidacao THEN ap.stake
        WHEN ap.moeda IN ('USD', 'USDT', 'USDC') AND v_moeda_consolidacao = 'BRL' THEN ap.stake * v_cotacao
        WHEN ap.moeda = 'BRL' AND v_moeda_consolidacao IN ('USD', 'USDT', 'USDC') THEN ap.stake / v_cotacao
        ELSE ap.stake
      END
    ), 0)
  INTO v_pernas_count, v_pernas_greens, v_pernas_reds, v_pernas_voids, v_pernas_meio_greens, v_pernas_meio_reds, v_total_stake_pernas
  FROM apostas_pernas ap
  JOIN apostas_unificada au ON ap.aposta_id = au.id
  WHERE au.projeto_id = p_projeto_id
    AND au.cancelled_at IS NULL
    AND au.forma_registro = 'ARBITRAGEM'
    AND (v_start_ts IS NULL OR au.data_aposta >= v_start_ts)
    AND (v_end_ts IS NULL OR au.data_aposta <= v_end_ts)
    AND (p_estrategia IS NULL OR au.estrategia = p_estrategia);

  -- ══════════════════════════════════════════════════════════════
  -- CASHBACK
  -- ══════════════════════════════════════════════════════════════
  IF p_estrategia IS NULL THEN
    SELECT COALESCE(SUM(
      CASE 
        WHEN valor_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN valor_brl_referencia
        WHEN COALESCE(moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(valor, 0)
        WHEN COALESCE(moeda_operacao, 'BRL') IN ('USD', 'USDT', 'USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(valor, 0) * v_cotacao
        ELSE COALESCE(valor, 0)
      END
    ), 0)
    INTO v_lucro_cashback
    FROM cashback_manual
    WHERE projeto_id = p_projeto_id
      AND (p_data_inicio IS NULL OR data_credito >= p_data_inicio::date)
      AND (p_data_fim IS NULL OR data_credito <= p_data_fim::date);
  ELSE
    v_lucro_cashback := 0;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- GIROS GRÁTIS
  -- ══════════════════════════════════════════════════════════════
  IF p_estrategia IS NULL THEN
    SELECT COALESCE(SUM(COALESCE(valor_retorno, 0)), 0)
    INTO v_lucro_giros
    FROM giros_gratis
    WHERE projeto_id = p_projeto_id
      AND status = 'CONFIRMADO'
      AND (p_data_inicio IS NULL OR data_registro >= p_data_inicio::date)
      AND (p_data_fim IS NULL OR data_registro <= p_data_fim::date);
  ELSE
    v_lucro_giros := 0;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- LUCRO DIÁRIO (calendário)
  -- ══════════════════════════════════════════════════════════════
  SELECT COALESCE(jsonb_agg(jsonb_build_object('dia', sub.dia, 'lucro', sub.lucro, 'qtd', sub.qtd) ORDER BY sub.dia), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT 
      (au.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date::text as dia,
      SUM(
        CASE
          WHEN au.pl_consolidado IS NOT NULL AND au.consolidation_currency = v_moeda_consolidacao THEN au.pl_consolidado
          WHEN au.lucro_prejuizo_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN au.lucro_prejuizo_brl_referencia
          WHEN COALESCE(au.moeda_operacao, 'BRL') = v_moeda_consolidacao THEN COALESCE(au.lucro_prejuizo, 0)
          WHEN COALESCE(au.moeda_operacao, 'BRL') IN ('USD', 'USDT', 'USDC') AND v_moeda_consolidacao = 'BRL' THEN COALESCE(au.lucro_prejuizo, 0) * v_cotacao
          WHEN COALESCE(au.moeda_operacao, 'BRL') = 'BRL' AND v_moeda_consolidacao IN ('USD', 'USDT', 'USDC') THEN COALESCE(au.lucro_prejuizo, 0) / v_cotacao
          ELSE COALESCE(au.lucro_prejuizo, 0)
        END
      ) as lucro,
      SUM(CASE 
        WHEN au.forma_registro = 'ARBITRAGEM' THEN COALESCE(pc.pernas_count, 1)
        ELSE 1
      END)::bigint as qtd
    FROM apostas_unificada au
    LEFT JOIN LATERAL (
      SELECT COUNT(*) as pernas_count
      FROM apostas_pernas ap2
      WHERE ap2.aposta_id = au.id
    ) pc ON au.forma_registro = 'ARBITRAGEM'
    WHERE au.projeto_id = p_projeto_id
      AND au.cancelled_at IS NULL
      AND au.status = 'LIQUIDADA'
      AND (v_start_ts IS NULL OR au.data_aposta >= v_start_ts)
      AND (v_end_ts IS NULL OR au.data_aposta <= v_end_ts)
      AND (p_estrategia IS NULL OR au.estrategia = p_estrategia)
    GROUP BY (au.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date
  ) sub;

  -- ══════════════════════════════════════════════════════════════
  -- RESULTADO FINAL
  -- ══════════════════════════════════════════════════════════════
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
    'lucro_total', v_lucro_apostas + v_lucro_cashback + v_lucro_giros,
    'daily', v_daily
  );

  RETURN v_result;
END;
$$;
