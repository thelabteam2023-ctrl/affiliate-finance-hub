-- Corrige get_projetos_lucro_operacional para fazer cross-rate via USD
-- quando a moeda de consolidação do projeto não é BRL.
-- 
-- Bug anterior: a RPC pegava cotacao_trabalho_eur (que está em EUR→BRL)
-- e multiplicava direto pelo valor mesmo quando moeda_consolidacao = USD,
-- gerando divergência com a Visão Geral (que faz cross-rate via USD).
--
-- Correção: se moeda_consolidacao != 'BRL', converte cada moeda estrangeira
-- usando cross-rate: taxa_final = taxa_moeda_BRL / taxa_consolidacao_BRL.

CREATE OR REPLACE FUNCTION public.get_projetos_lucro_operacional(
  p_projeto_ids uuid[],
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
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
  v_taxa_consolidacao_brl numeric;
  v_bm_ids uuid[];
  v_modulo text;
  v_moeda text;
  v_valor numeric;
  v_taxa numeric;
  v_taxa_brl numeric;
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

    -- Buscar cotações de trabalho por projeto (todas em "X→BRL") + moeda de consolidação
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

    -- Determinar a taxa da moeda de consolidação em BRL (para cross-rate)
    -- Se consolidação for BRL, taxa = 1. Senão, busca a taxa "MOEDA→BRL" do projeto.
    IF v_moeda_consolidacao = 'BRL' THEN
      v_taxa_consolidacao_brl := 1;
    ELSE
      v_taxa_consolidacao_brl := COALESCE((v_proj_cotacoes ->> v_moeda_consolidacao)::numeric, 0);
      IF v_taxa_consolidacao_brl IS NULL OR v_taxa_consolidacao_brl <= 0 THEN
        v_taxa_consolidacao_brl := 1; -- fallback seguro
      END IF;
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
            SUM(COALESCE(g.valor_premio, 0))::numeric as total
          FROM giros_gratis g
          JOIN bookmakers b ON b.id = g.bookmaker_id
          WHERE g.projeto_id = v_proj AND g.status = 'CONFIRMADO'
            AND (v_start_date IS NULL OR g.data_giro >= v_start_date)
            AND (v_end_date IS NULL OR g.data_giro <= v_end_date)
          GROUP BY 1
        ) sub
      ),
      'bonus', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(b.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(b.moeda, 'BRL')) END as moeda,
            SUM(COALESCE(pbb.valor_bonus, 0))::numeric as total
          FROM project_bookmaker_link_bonuses pbb
          JOIN bookmakers b ON b.id = pbb.bookmaker_id
          WHERE pbb.projeto_id = v_proj
            AND pbb.status = 'GANHOU'
            AND COALESCE(pbb.tipo_bonus, '') <> 'FREEBET'
            AND (v_start_date IS NULL OR pbb.data_ganho >= v_start_date)
            AND (v_end_date IS NULL OR pbb.data_ganho <= v_end_date)
          GROUP BY 1
        ) sub
      ),
      'perdas', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(b.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(b.moeda, 'BRL')) END as moeda,
            SUM(COALESCE(po.valor_perda, 0))::numeric as total
          FROM perdas_operacionais po
          JOIN bookmakers b ON b.id = po.bookmaker_id
          WHERE po.projeto_id = v_proj AND po.status = 'CONFIRMADO'
            AND (v_start_date IS NULL OR po.data_perda >= v_start_date)
            AND (v_end_date IS NULL OR po.data_perda <= v_end_date)
          GROUP BY 1
        ) sub
      ),
      'conciliacoes', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END as moeda,
            SUM(COALESCE(cl.valor, 0))::numeric as total
          FROM cash_ledger cl
          WHERE cl.workspace_id = (SELECT workspace_id FROM projetos WHERE id = v_proj)
            AND cl.tipo_transacao = 'CONCILIACAO_VINCULO'
            AND cl.projeto_id_snapshot = v_proj
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
              CASE WHEN cl.ajuste_direcao = 'NEGATIVO' THEN -COALESCE(cl.valor, 0)
                   ELSE COALESCE(cl.valor, 0) END
            )::numeric as total
          FROM cash_ledger cl
          WHERE cl.workspace_id = (SELECT workspace_id FROM projetos WHERE id = v_proj)
            AND cl.tipo_transacao = 'AJUSTE_SALDO'
            AND (
              cl.origem_bookmaker_id = ANY(v_bm_ids)
              OR cl.destino_bookmaker_id = ANY(v_bm_ids)
            )
            AND cl.status = 'CONFIRMADO'
            AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
            AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
          GROUP BY 1
        ) sub
      ),
      'fx', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END as moeda,
            SUM(COALESCE(cl.valor, 0))::numeric as total
          FROM cash_ledger cl
          WHERE cl.workspace_id = (SELECT workspace_id FROM projetos WHERE id = v_proj)
            AND cl.tipo_transacao = 'RESULTADO_CAMBIAL'
            AND (
              cl.origem_bookmaker_id = ANY(v_bm_ids)
              OR cl.destino_bookmaker_id = ANY(v_bm_ids)
            )
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
            SUM(COALESCE(cl.valor, 0))::numeric as total
          FROM cash_ledger cl
          WHERE cl.workspace_id = (SELECT workspace_id FROM projetos WHERE id = v_proj)
            AND cl.tipo_transacao = 'EVENTO_PROMOCIONAL'
            AND (
              cl.origem_bookmaker_id = ANY(v_bm_ids)
              OR cl.destino_bookmaker_id = ANY(v_bm_ids)
            )
            AND cl.status = 'CONFIRMADO'
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
            SUM(COALESCE(cl.valor, 0))::numeric as total
          FROM cash_ledger cl
          WHERE cl.workspace_id = (SELECT workspace_id FROM projetos WHERE id = v_proj)
            AND cl.tipo_transacao = 'PERDA_CANCELAMENTO_BONUS'
            AND (
              cl.origem_bookmaker_id = ANY(v_bm_ids)
              OR cl.destino_bookmaker_id = ANY(v_bm_ids)
            )
            AND cl.status = 'CONFIRMADO'
            AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts)
            AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
          GROUP BY 1
        ) sub
      )
    ) INTO v_proj_result;

    -- Conversão server-side com cross-rate via BRL para moeda de consolidação
    v_proj_consolidado := 0;
    v_proj_por_moeda := '{}'::jsonb;

    FOR v_modulo, v_modulo_data IN SELECT * FROM jsonb_each(v_proj_result) LOOP
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

        v_porm_acc := COALESCE((v_proj_por_moeda ->> v_moeda_iter)::numeric, 0) + (v_signal * v_valor_iter);
        v_proj_por_moeda := v_proj_por_moeda || jsonb_build_object(v_moeda_iter, v_porm_acc);

        -- Conversão para moeda de consolidação via cross-rate em BRL
        IF v_moeda_iter = v_moeda_consolidacao THEN
          v_taxa := 1;
        ELSIF v_moeda_iter = 'BRL' THEN
          -- BRL → moeda_consolidacao: 1 / taxa_consolidacao_brl
          v_taxa := 1 / v_taxa_consolidacao_brl;
        ELSE
          -- moeda_X → BRL → moeda_consolidacao
          v_taxa_brl := COALESCE((v_proj_cotacoes ->> v_moeda_iter)::numeric, 0);
          IF v_taxa_brl IS NULL OR v_taxa_brl <= 0 THEN
            v_taxa := 1; -- fallback: sem conversão
          ELSE
            v_taxa := v_taxa_brl / v_taxa_consolidacao_brl;
          END IF;
        END IF;

        v_proj_consolidado := v_proj_consolidado + (v_signal * v_valor_iter * v_taxa);
      END LOOP;
    END LOOP;

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