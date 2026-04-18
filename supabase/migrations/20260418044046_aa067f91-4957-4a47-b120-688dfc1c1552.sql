
CREATE OR REPLACE FUNCTION get_projetos_lucro_operacional(
  p_projeto_ids uuid[],
  p_data_inicio text DEFAULT NULL,
  p_data_fim text DEFAULT NULL,
  p_cotacoes jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_start_date date;
  v_end_date date;
  v_proj uuid;
  v_proj_result jsonb;
  v_proj_consolidado numeric := 0;
  v_proj_por_moeda jsonb := '{}'::jsonb;
  v_proj_cotacoes jsonb;
  v_moeda_consolidacao text;
  v_bm_ids uuid[];
  v_modulo text;
  v_moeda text;
  v_valor numeric;
  v_taxa numeric;
  v_signal numeric;
  v_modulo_data jsonb;
  v_moeda_iter text;
  v_valor_iter numeric;
  v_porm_acc numeric;
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

    -- Buscar cotações de trabalho por projeto + moeda de consolidação
    SELECT 
      jsonb_strip_nulls(jsonb_build_object(
        'USD', cotacao_trabalho,
        'EUR', cotacao_trabalho_eur,
        'GBP', cotacao_trabalho_gbp,
        'MYR', cotacao_trabalho_myr,
        'MXN', cotacao_trabalho_mxn,
        'ARS', cotacao_trabalho_ars,
        'COP', cotacao_trabalho_cop
      )),
      UPPER(COALESCE(moeda_consolidacao, 'BRL'))
      INTO v_proj_cotacoes, v_moeda_consolidacao
    FROM projetos WHERE id = v_proj;

    -- Permitir override via parametro p_cotacoes (cotação por projeto explícita)
    IF p_cotacoes ? v_proj::text THEN
      v_proj_cotacoes := COALESCE(v_proj_cotacoes, '{}'::jsonb) || (p_cotacoes -> v_proj::text);
    END IF;

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
            CASE WHEN UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) END as moeda,
            SUM(COALESCE(bl.bonus_amount, 0))::numeric as total
          FROM project_bookmaker_link_bonuses bl
          LEFT JOIN bookmakers b ON b.id = bl.bookmaker_id
          WHERE bl.project_id = v_proj
            AND bl.status IN ('credited', 'finalized')
            AND bl.credited_at IS NOT NULL
            AND (bl.tipo_bonus IS NULL OR bl.tipo_bonus != 'FREEBET')
            AND COALESCE(bl.bonus_amount, 0) > 0
            AND (v_start_ts IS NULL OR bl.credited_at >= v_start_ts)
            AND (v_end_ts IS NULL OR bl.credited_at <= v_end_ts)
          GROUP BY 1
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
      'conciliacoes', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(b.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(b.moeda, 'BRL')) END as moeda,
            SUM(COALESCE(ba.saldo_novo, 0) - COALESCE(ba.saldo_anterior, 0))::numeric as total
          FROM bookmaker_balance_audit ba
          JOIN bookmakers b ON b.id = ba.bookmaker_id
          WHERE ba.origem = 'CONCILIACAO_VINCULO'
            AND ba.referencia_tipo = 'projeto'
            AND ba.referencia_id = v_proj
            AND (v_start_ts IS NULL OR ba.created_at >= v_start_ts)
            AND (v_end_ts IS NULL OR ba.created_at <= v_end_ts)
          GROUP BY 1
        ) sub
      ),
      'ajustes_saldo', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END as moeda,
            SUM(CASE WHEN cl.ajuste_direcao = 'SAIDA' THEN -COALESCE(cl.valor, 0)
                     ELSE COALESCE(cl.valor, 0) END)::numeric as total
          FROM cash_ledger cl
          WHERE cl.status = 'CONFIRMADO'
            AND cl.tipo_transacao = 'AJUSTE_SALDO'
            AND cl.projeto_id_snapshot = v_proj
            AND COALESCE(cl.valor, 0) != 0
            AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
            AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
          GROUP BY 1
        ) sub
      ),
      'resultado_cambial', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END as moeda,
            SUM(CASE WHEN cl.tipo_transacao = 'PERDA_CAMBIAL' THEN -COALESCE(cl.valor, 0)
                     ELSE COALESCE(cl.valor, 0) END)::numeric as total
          FROM cash_ledger cl
          WHERE cl.status = 'CONFIRMADO'
            AND cl.tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL')
            AND cl.projeto_id_snapshot = v_proj
            AND COALESCE(cl.valor, 0) != 0
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
            SUM(COALESCE(cl.valor, 0))::numeric as total
          FROM cash_ledger cl
          WHERE cl.status = 'CONFIRMADO'
            AND cl.tipo_transacao IN ('FREEBET_CONVERTIDA', 'CREDITO_PROMOCIONAL', 'GIRO_GRATIS_GANHO')
            AND cl.destino_bookmaker_id = ANY(v_bm_ids)
            AND COALESCE(cl.valor, 0) > 0
            AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
            AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
          GROUP BY 1
        ) sub
      ),
      'perdas_cancelamento', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END as moeda,
            SUM(
              COALESCE(
                (cl.auditoria_metadata::jsonb ->> 'valor_perdido')::numeric,
                cl.valor,
                0
              )
            )::numeric as total
          FROM cash_ledger cl
          WHERE cl.ajuste_motivo = 'BONUS_CANCELAMENTO'
            AND cl.ajuste_direcao = 'SAIDA'
            AND cl.origem_bookmaker_id = ANY(v_bm_ids)
            AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
            AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
          GROUP BY 1
        ) sub
      )
    ) INTO v_proj_result;

    -- Conversão server-side para moeda de consolidação do projeto
    v_proj_consolidado := 0;
    v_proj_por_moeda := '{}'::jsonb;

    FOR v_modulo, v_modulo_data IN SELECT * FROM jsonb_each(v_proj_result) LOOP
      -- Determinar sinal: perdas e perdas_cancelamento são subtrativos
      IF v_modulo IN ('perdas', 'perdas_cancelamento') THEN
        v_signal := -1;
      ELSE
        v_signal := 1;
      END IF;

      FOR v_moeda_iter, v_valor_iter IN
        SELECT key, (value)::text::numeric FROM jsonb_each_text(v_modulo_data)
      LOOP
        IF v_valor_iter IS NULL OR ABS(v_valor_iter) < 0.001 THEN
          CONTINUE;
        END IF;

        -- Acumular em porMoeda (com sinal aplicado, mantém retrocompat)
        v_porm_acc := COALESCE((v_proj_por_moeda ->> v_moeda_iter)::numeric, 0) + (v_signal * v_valor_iter);
        v_proj_por_moeda := v_proj_por_moeda || jsonb_build_object(v_moeda_iter, v_porm_acc);

        -- Converter para moeda de consolidação
        IF v_moeda_iter = v_moeda_consolidacao THEN
          v_taxa := 1;
        ELSIF v_proj_cotacoes ? v_moeda_iter THEN
          v_taxa := (v_proj_cotacoes ->> v_moeda_iter)::numeric;
          IF v_taxa IS NULL OR v_taxa <= 0 THEN
            v_taxa := 1;
          END IF;
        ELSE
          v_taxa := 1;
        END IF;

        v_proj_consolidado := v_proj_consolidado + (v_signal * v_valor_iter * v_taxa);
      END LOOP;
    END LOOP;

    -- Anexar campos calculados ao resultado
    v_proj_result := v_proj_result || jsonb_build_object(
      '__consolidado', v_proj_consolidado,
      '__porMoeda', v_proj_por_moeda,
      '__moedaConsolidacao', v_moeda_consolidacao
    );

    v_result := v_result || jsonb_build_object(v_proj::text, v_proj_result);
  END LOOP;

  RETURN v_result;
END;
$$;
