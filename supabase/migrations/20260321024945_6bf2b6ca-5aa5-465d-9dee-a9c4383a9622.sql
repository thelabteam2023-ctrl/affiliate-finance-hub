
CREATE OR REPLACE FUNCTION get_projetos_lucro_operacional(
  p_projeto_ids uuid[],
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
  v_result jsonb := '{}'::jsonb;
  v_start_utc text;
  v_end_utc text;
  v_proj uuid;
  v_proj_result jsonb;
  v_bm_ids uuid[];
BEGIN
  -- Timezone conversion (São Paulo operational)
  IF p_data_inicio IS NOT NULL THEN
    v_start_utc := ((p_data_inicio || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo')::text;
  END IF;
  IF p_data_fim IS NOT NULL THEN
    v_end_utc := ((p_data_fim || ' 23:59:59.999')::timestamp AT TIME ZONE 'America/Sao_Paulo')::text;
  END IF;

  FOREACH v_proj IN ARRAY p_projeto_ids LOOP
    -- Get project's bookmaker IDs
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_bm_ids
    FROM bookmakers WHERE projeto_id = v_proj;

    SELECT jsonb_build_object(
      -- 1. Apostas liquidadas (by currency, handles multicurrency via pernas)
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
              AND (v_start_utc IS NULL OR a.data_aposta >= v_start_utc)
              AND (v_end_utc IS NULL OR a.data_aposta <= v_end_utc)
            UNION ALL
            SELECT
              CASE WHEN UPPER(COALESCE(p.moeda, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                   ELSE UPPER(COALESCE(p.moeda, 'BRL')) END as moeda,
              COALESCE(p.lucro_prejuizo, 0) as val
            FROM apostas_unificada a
            JOIN apostas_pernas p ON p.aposta_id = a.id
            WHERE a.projeto_id = v_proj AND a.status = 'LIQUIDADA'
              AND a.is_multicurrency = TRUE
              AND (v_start_utc IS NULL OR a.data_aposta >= v_start_utc)
              AND (v_end_utc IS NULL OR a.data_aposta <= v_end_utc)
          ) raw_data
          GROUP BY moeda
        ) agg
      ),
      -- 2. Cashback manual
      'cashback', (
        SELECT COALESCE(jsonb_object_agg(moeda, total), '{}'::jsonb)
        FROM (
          SELECT
            CASE WHEN UPPER(COALESCE(moeda_operacao, 'BRL')) IN ('USDT','USDC') THEN 'USD'
                 ELSE UPPER(COALESCE(moeda_operacao, 'BRL')) END as moeda,
            SUM(COALESCE(valor, 0))::numeric as total
          FROM cashback_manual
          WHERE projeto_id = v_proj
            AND (p_data_inicio IS NULL OR data_credito >= p_data_inicio)
            AND (p_data_fim IS NULL OR data_credito <= p_data_fim)
          GROUP BY 1
        ) sub
      ),
      -- 3. Giros grátis confirmados
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
            AND (v_start_utc IS NULL OR g.data_registro::text >= v_start_utc)
            AND (v_end_utc IS NULL OR g.data_registro::text <= v_end_utc)
          GROUP BY 1
        ) sub
      ),
      -- 4. Bônus ganhos (exclui FREEBET)
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
            AND (v_start_utc IS NULL OR bl.credited_at >= v_start_utc)
            AND (v_end_utc IS NULL OR bl.credited_at <= v_end_utc)
          GROUP BY 1
        ) sub
      ),
      -- 5. Perdas operacionais confirmadas (valor absoluto)
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
            AND (p_data_inicio IS NULL OR pp.data_registro >= p_data_inicio)
            AND (p_data_fim IS NULL OR pp.data_registro <= p_data_fim)
          GROUP BY 1
        ) sub
      ),
      -- 6. Conciliações de vínculo
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
            AND ba.referencia_id = v_proj::text
            AND (v_start_utc IS NULL OR ba.created_at::text >= v_start_utc)
            AND (v_end_utc IS NULL OR ba.created_at::text <= v_end_utc)
          GROUP BY 1
        ) sub
      ),
      -- 7. Ajustes de saldo (cash_ledger) - já com sinal
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
            AND cl.projeto_id_snapshot = v_proj::text
            AND COALESCE(cl.valor, 0) != 0
            AND (v_start_utc IS NULL OR cl.data_transacao >= v_start_utc)
            AND (v_end_utc IS NULL OR cl.data_transacao <= v_end_utc)
          GROUP BY 1
        ) sub
      ),
      -- 8. Resultado cambial (cash_ledger) - já com sinal
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
            AND cl.projeto_id_snapshot = v_proj::text
            AND COALESCE(cl.valor, 0) != 0
            AND (v_start_utc IS NULL OR cl.data_transacao >= v_start_utc)
            AND (v_end_utc IS NULL OR cl.data_transacao <= v_end_utc)
          GROUP BY 1
        ) sub
      ),
      -- 9. Eventos promocionais (cash_ledger)
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
            AND (v_start_utc IS NULL OR cl.data_transacao >= v_start_utc)
            AND (v_end_utc IS NULL OR cl.data_transacao <= v_end_utc)
          GROUP BY 1
        ) sub
      ),
      -- 10. Perdas cancelamento bônus (cash_ledger) - valor absoluto
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
            AND (v_start_utc IS NULL OR cl.data_transacao >= v_start_utc)
            AND (v_end_utc IS NULL OR cl.data_transacao <= v_end_utc)
          GROUP BY 1
        ) sub
      )
    ) INTO v_proj_result;

    v_result := v_result || jsonb_build_object(v_proj::text, v_proj_result);
  END LOOP;

  RETURN v_result;
END;
$$;
