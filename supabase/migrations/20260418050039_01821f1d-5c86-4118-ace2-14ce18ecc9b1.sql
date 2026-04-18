CREATE OR REPLACE FUNCTION public.get_projetos_lucro_operacional(p_projeto_ids uuid[], p_data_inicio text DEFAULT NULL::text, p_data_fim text DEFAULT NULL::text, p_cotacoes jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_start_date date;
  v_end_date date;
  v_proj uuid;
  v_proj_result jsonb;
  v_bm_ids uuid[];
  v_moeda_consolidacao text;
  v_cot_usd numeric;
  v_cot_eur numeric;
  v_cot_gbp numeric;
  v_cot_myr numeric;
  v_cot_mxn numeric;
  v_cot_ars numeric;
  v_cot_cop numeric;
  v_cot_override jsonb;
  v_consolidado numeric;
  v_por_moeda jsonb;
  v_modulo text;
  v_modulo_data jsonb;
  v_moeda text;
  v_valor numeric;
  v_taxa numeric;
  v_taxa_brl numeric;
  v_taxa_consolidacao_brl numeric;
  v_acc numeric;
BEGIN
  IF p_data_inicio IS NOT NULL THEN
    v_start_ts := (p_data_inicio || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_start_date := p_data_inicio::date;
  END IF;
  IF p_data_fim IS NOT NULL THEN
    v_end_ts := (p_data_fim || ' 23:59:59.999')::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_end_date := p_data_fim::date;
  END IF;

  FOREACH v_proj IN ARRAY p_projeto_ids LOOP
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_bm_ids
    FROM bookmakers WHERE projeto_id = v_proj;

    SELECT 
      COALESCE(moeda_consolidacao, 'BRL'),
      COALESCE(cotacao_trabalho, 1),
      COALESCE(cotacao_trabalho_eur, 1),
      COALESCE(cotacao_trabalho_gbp, 1),
      COALESCE(cotacao_trabalho_myr, 1),
      COALESCE(cotacao_trabalho_mxn, 1),
      COALESCE(cotacao_trabalho_ars, 1),
      COALESCE(cotacao_trabalho_cop, 1)
    INTO v_moeda_consolidacao, v_cot_usd, v_cot_eur, v_cot_gbp, v_cot_myr, v_cot_mxn, v_cot_ars, v_cot_cop
    FROM projetos WHERE id = v_proj;

    v_cot_override := COALESCE(p_cotacoes->v_proj::text, '{}'::jsonb);
    IF v_cot_override ? 'USD' THEN v_cot_usd := (v_cot_override->>'USD')::numeric; END IF;
    IF v_cot_override ? 'EUR' THEN v_cot_eur := (v_cot_override->>'EUR')::numeric; END IF;
    IF v_cot_override ? 'GBP' THEN v_cot_gbp := (v_cot_override->>'GBP')::numeric; END IF;
    IF v_cot_override ? 'MYR' THEN v_cot_myr := (v_cot_override->>'MYR')::numeric; END IF;
    IF v_cot_override ? 'MXN' THEN v_cot_mxn := (v_cot_override->>'MXN')::numeric; END IF;
    IF v_cot_override ? 'ARS' THEN v_cot_ars := (v_cot_override->>'ARS')::numeric; END IF;
    IF v_cot_override ? 'COP' THEN v_cot_cop := (v_cot_override->>'COP')::numeric; END IF;

    v_taxa_consolidacao_brl := CASE UPPER(v_moeda_consolidacao)
      WHEN 'BRL' THEN 1
      WHEN 'USD' THEN v_cot_usd
      WHEN 'EUR' THEN v_cot_eur
      WHEN 'GBP' THEN v_cot_gbp
      WHEN 'MYR' THEN v_cot_myr
      WHEN 'MXN' THEN v_cot_mxn
      WHEN 'ARS' THEN v_cot_ars
      WHEN 'COP' THEN v_cot_cop
      ELSE 1
    END;

    SELECT jsonb_build_object(
      'apostas', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT moeda, SUM(val)::numeric as total FROM (
            SELECT
              CASE WHEN UPPER(COALESCE(a.moeda_operacao, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                   ELSE UPPER(COALESCE(a.moeda_operacao, 'BRL')) END as moeda,
              COALESCE(a.lucro_prejuizo, 0) as val
            FROM apostas_unificada a
            WHERE a.projeto_id = v_proj AND a.status = 'LIQUIDADA'
              AND (a.is_multicurrency IS NOT TRUE)
              AND (v_start_ts IS NULL OR a.data_aposta >= v_start_ts)
              AND (v_end_ts IS NULL OR a.data_aposta <= v_end_ts)
            UNION ALL
            SELECT
              CASE WHEN UPPER(COALESCE(p.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                   ELSE UPPER(COALESCE(p.moeda, 'BRL')) END as moeda,
              COALESCE(p.lucro_prejuizo, 0) as val
            FROM apostas_unificada a
            JOIN apostas_pernas p ON p.aposta_id = a.id
            WHERE a.projeto_id = v_proj AND a.status = 'LIQUIDADA'
              AND a.is_multicurrency = TRUE
              AND (v_start_ts IS NULL OR a.data_aposta >= v_start_ts)
              AND (v_end_ts IS NULL OR a.data_aposta <= v_end_ts)
          ) raw_data
          GROUP BY moeda
        ) agg
      ),
      'cashback', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(moeda_operacao, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(moeda_operacao, 'BRL')) END as moeda,
            SUM(COALESCE(valor, 0))::numeric as total
          FROM cashback_manual
          WHERE projeto_id = v_proj
            AND (v_start_date IS NULL OR data_credito >= v_start_date)
            AND (v_end_date IS NULL OR data_credito <= v_end_date)
          GROUP BY 1
        ) sub
      ),
      'giros', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(b.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(b.moeda, 'BRL')) END as moeda,
            SUM(GREATEST(COALESCE(g.valor_retorno, 0), 0))::numeric as total
          FROM giros_gratis g
          JOIN bookmakers b ON b.id = g.bookmaker_id
          WHERE g.projeto_id = v_proj AND g.status = 'confirmado'
            AND g.valor_retorno IS NOT NULL AND g.valor_retorno > 0
            AND (v_start_ts IS NULL OR g.data_registro >= v_start_ts)
            AND (v_end_ts IS NULL OR g.data_registro <= v_end_ts)
          GROUP BY 1
        ) sub
      ),
      'bonus', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            '__SNAPSHOT_USD__' as moeda,
            SUM(
              COALESCE(
                bl.valor_consolidado_snapshot,
                CASE 
                  WHEN UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) IN ('USD','USDT','USDC') THEN COALESCE(bl.bonus_amount, 0)
                  WHEN UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) = 'BRL' THEN COALESCE(bl.bonus_amount, 0) / NULLIF(v_cot_usd, 0)
                  WHEN UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) = 'EUR' THEN (COALESCE(bl.bonus_amount, 0) * v_cot_eur) / NULLIF(v_cot_usd, 0)
                  WHEN UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) = 'GBP' THEN (COALESCE(bl.bonus_amount, 0) * v_cot_gbp) / NULLIF(v_cot_usd, 0)
                  WHEN UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) = 'MYR' THEN (COALESCE(bl.bonus_amount, 0) * v_cot_myr) / NULLIF(v_cot_usd, 0)
                  WHEN UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) = 'MXN' THEN (COALESCE(bl.bonus_amount, 0) * v_cot_mxn) / NULLIF(v_cot_usd, 0)
                  WHEN UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) = 'ARS' THEN (COALESCE(bl.bonus_amount, 0) * v_cot_ars) / NULLIF(v_cot_usd, 0)
                  WHEN UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) = 'COP' THEN (COALESCE(bl.bonus_amount, 0) * v_cot_cop) / NULLIF(v_cot_usd, 0)
                  ELSE COALESCE(bl.bonus_amount, 0)
                END
              )
            )::numeric as total
          FROM project_bookmaker_link_bonuses bl
          LEFT JOIN bookmakers b ON b.id = bl.bookmaker_id
          WHERE bl.project_id = v_proj
            AND bl.status IN ('credited', 'finalized')
            AND bl.credited_at IS NOT NULL
            AND (bl.tipo_bonus IS NULL OR bl.tipo_bonus != 'FREEBET')
            AND COALESCE(bl.bonus_amount, 0) > 0
            AND (v_start_ts IS NULL OR bl.credited_at >= v_start_ts)
            AND (v_end_ts IS NULL OR bl.credited_at <= v_end_ts)
          HAVING SUM(COALESCE(bl.valor_consolidado_snapshot, bl.bonus_amount)) > 0
        ) sub
      ),
      'perdas', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(b.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(b.moeda, 'BRL')) END as moeda,
            SUM(COALESCE(pp.valor, 0))::numeric as total
          FROM projeto_perdas pp
          LEFT JOIN bookmakers b ON b.id = pp.bookmaker_id
          WHERE pp.projeto_id = v_proj AND pp.status = 'CONFIRMADA'
            AND COALESCE(pp.valor, 0) > 0
            AND (v_start_ts IS NULL OR pp.data_registro >= v_start_ts)
            AND (v_end_ts IS NULL OR pp.data_registro <= v_end_ts)
          GROUP BY 1
        ) sub
      ),
      'conciliacao', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END as moeda,
            SUM(
              CASE 
                WHEN cl.tipo_transacao = 'AJUSTE_CONCILIACAO' AND cl.ajuste_direcao = 'CREDITO' THEN ABS(COALESCE(cl.valor, 0))
                WHEN cl.tipo_transacao = 'AJUSTE_CONCILIACAO' AND cl.ajuste_direcao = 'DEBITO' THEN -ABS(COALESCE(cl.valor, 0))
                ELSE 0
              END
            )::numeric as total
          FROM cash_ledger cl
          WHERE (cl.origem_bookmaker_id = ANY(v_bm_ids) OR cl.destino_bookmaker_id = ANY(v_bm_ids))
            AND cl.tipo_transacao = 'AJUSTE_CONCILIACAO'
            AND cl.status = 'CONFIRMADO'
            AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
            AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
          GROUP BY 1
        ) sub
      ),
      'ajustes', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END as moeda,
            SUM(
              CASE 
                WHEN cl.ajuste_direcao = 'CREDITO' THEN ABS(COALESCE(cl.valor, 0))
                WHEN cl.ajuste_direcao = 'DEBITO' THEN -ABS(COALESCE(cl.valor, 0))
                ELSE 0
              END
            )::numeric as total
          FROM cash_ledger cl
          WHERE (cl.origem_bookmaker_id = ANY(v_bm_ids) OR cl.destino_bookmaker_id = ANY(v_bm_ids))
            AND cl.tipo_transacao IN ('AJUSTE_SALDO', 'RESULTADO_CAMBIAL')
            AND cl.status = 'CONFIRMADO'
            AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
            AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
          GROUP BY 1
        ) sub
      ),
      'promocionais', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END as moeda,
            SUM(
              CASE 
                WHEN cl.ajuste_direcao = 'CREDITO' THEN ABS(COALESCE(cl.valor, 0))
                WHEN cl.ajuste_direcao = 'DEBITO' THEN -ABS(COALESCE(cl.valor, 0))
                ELSE 0
              END
            )::numeric as total
          FROM cash_ledger cl
          WHERE (cl.origem_bookmaker_id = ANY(v_bm_ids) OR cl.destino_bookmaker_id = ANY(v_bm_ids))
            AND cl.tipo_transacao = 'EVENTO_PROMOCIONAL'
            AND cl.status = 'CONFIRMADO'
            AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
            AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
          GROUP BY 1
        ) sub
      ),
      'cancelamento_bonus', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END as moeda,
            SUM(ABS(COALESCE(cl.valor, 0)))::numeric as total
          FROM cash_ledger cl
          WHERE (cl.origem_bookmaker_id = ANY(v_bm_ids) OR cl.destino_bookmaker_id = ANY(v_bm_ids))
            AND cl.tipo_transacao = 'PERDA_CANCELAMENTO_BONUS'
            AND cl.status = 'CONFIRMADO'
            AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
            AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
          GROUP BY 1
        ) sub
      )
    ) INTO v_proj_result;

    v_consolidado := 0;
    v_por_moeda := '{}'::jsonb;

    FOR v_modulo IN SELECT jsonb_object_keys(v_proj_result) LOOP
      v_modulo_data := v_proj_result->v_modulo;
      
      FOR v_moeda IN SELECT jsonb_object_keys(v_modulo_data) LOOP
        v_valor := (v_modulo_data->>v_moeda)::numeric;
        IF v_valor IS NULL OR v_valor = 0 THEN CONTINUE; END IF;

        IF v_moeda = '__SNAPSHOT_USD__' THEN
          IF UPPER(v_moeda_consolidacao) = 'USD' THEN
            v_taxa := 1;
          ELSIF UPPER(v_moeda_consolidacao) = 'BRL' THEN
            v_taxa := v_cot_usd;
          ELSE
            v_taxa := v_cot_usd / NULLIF(v_taxa_consolidacao_brl, 0);
          END IF;

          IF v_modulo IN ('perdas', 'cancelamento_bonus') THEN
            v_consolidado := v_consolidado - (v_valor * COALESCE(v_taxa, 1));
          ELSE
            v_consolidado := v_consolidado + (v_valor * COALESCE(v_taxa, 1));
          END IF;

          v_acc := COALESCE((v_por_moeda->>'USD')::numeric, 0);
          IF v_modulo IN ('perdas', 'cancelamento_bonus') THEN
            v_acc := v_acc - v_valor;
          ELSE
            v_acc := v_acc + v_valor;
          END IF;
          v_por_moeda := jsonb_set(v_por_moeda, ARRAY['USD'], to_jsonb(v_acc));
          CONTINUE;
        END IF;

        IF UPPER(v_moeda) = UPPER(v_moeda_consolidacao) THEN
          v_taxa := 1;
        ELSE
          v_taxa_brl := CASE UPPER(v_moeda)
            WHEN 'BRL' THEN 1
            WHEN 'USD' THEN v_cot_usd
            WHEN 'EUR' THEN v_cot_eur
            WHEN 'GBP' THEN v_cot_gbp
            WHEN 'MYR' THEN v_cot_myr
            WHEN 'MXN' THEN v_cot_mxn
            WHEN 'ARS' THEN v_cot_ars
            WHEN 'COP' THEN v_cot_cop
            ELSE 1
          END;
          
          IF UPPER(v_moeda_consolidacao) = 'BRL' THEN
            v_taxa := v_taxa_brl;
          ELSE
            v_taxa := v_taxa_brl / NULLIF(v_taxa_consolidacao_brl, 0);
          END IF;
        END IF;

        IF v_modulo IN ('perdas', 'cancelamento_bonus') THEN
          v_consolidado := v_consolidado - (v_valor * COALESCE(v_taxa, 1));
        ELSE
          v_consolidado := v_consolidado + (v_valor * COALESCE(v_taxa, 1));
        END IF;

        v_acc := COALESCE((v_por_moeda->>UPPER(v_moeda))::numeric, 0);
        IF v_modulo IN ('perdas', 'cancelamento_bonus') THEN
          v_acc := v_acc - v_valor;
        ELSE
          v_acc := v_acc + v_valor;
        END IF;
        v_por_moeda := jsonb_set(v_por_moeda, ARRAY[UPPER(v_moeda)], to_jsonb(v_acc));
      END LOOP;
    END LOOP;

    v_proj_result := v_proj_result || jsonb_build_object(
      '__consolidado', v_consolidado,
      '__porMoeda', v_por_moeda,
      '__moedaConsolidacao', v_moeda_consolidacao
    );

    v_result := v_result || jsonb_build_object(v_proj::text, v_proj_result);
  END LOOP;

  RETURN v_result;
END;
$function$;