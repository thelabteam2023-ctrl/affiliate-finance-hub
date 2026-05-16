-- 1. Atualizar get_projeto_dashboard_data para incluir blocos faltantes (ledger_extras, depositos, saques, conciliacoes)
CREATE OR REPLACE FUNCTION public.get_projeto_dashboard_data(p_projeto_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_moeda text;
  v_cotacao_trabalho numeric;
  v_fonte_cotacao text;
BEGIN
  SELECT moeda_consolidacao, cotacao_trabalho, fonte_cotacao
  INTO v_moeda, v_cotacao_trabalho, v_fonte_cotacao
  FROM projetos WHERE id = p_projeto_id;

  result := jsonb_build_object(
    'moeda_consolidacao', COALESCE(v_moeda, 'BRL'),
    'cotacao_trabalho', v_cotacao_trabalho,
    'fonte_cotacao', v_fonte_cotacao,

    'apostas', (
      SELECT COALESCE(jsonb_agg(row_to_json(a) ORDER BY a.data_aposta ASC), '[]'::jsonb)
      FROM (
        SELECT id, data_aposta, lucro_prejuizo, pl_consolidado,
               lucro_prejuizo_brl_referencia, stake, stake_total,
               stake_consolidado, moeda_operacao, consolidation_currency,
               forma_registro, estrategia, resultado, bonus_id,
               bookmaker_id, valor_brl_referencia, esporte, status,
               is_multicurrency
        FROM apostas_unificada
        WHERE projeto_id = p_projeto_id
          AND cancelled_at IS NULL
      ) a
    ),

    'apostas_pernas', (
      SELECT COALESCE(jsonb_agg(row_to_json(ae_mapped)), '[]'::jsonb)
      FROM (
        SELECT 
          ap.aposta_id, 
          ae.stake, 
          ae.moeda, 
          ae.bookmaker_id,
          CASE 
            WHEN ap.resultado = 'GREEN' THEN ae.stake * (ae.odd - 1)
            WHEN ap.resultado = 'RED' THEN -ae.stake
            WHEN ap.resultado = 'MEIO_GREEN' THEN (ae.stake * (ae.odd - 1) / 2)
            WHEN ap.resultado = 'MEIO_RED' THEN -(ae.stake / 2)
            WHEN ap.resultado = 'VOID' THEN 0
            ELSE 0
          END as lucro_prejuizo,
          ap.resultado, 
          ae.stake_brl_referencia
        FROM apostas_perna_entradas ae
        JOIN apostas_pernas ap ON ap.id = ae.perna_id
        INNER JOIN apostas_unificada au ON au.id = ap.aposta_id
        WHERE au.projeto_id = p_projeto_id
          AND au.cancelled_at IS NULL
      ) ae_mapped
    ),
    
    'bookmakers', (
      SELECT COALESCE(jsonb_agg(row_to_json(bk)), '[]'::jsonb)
      FROM (
        SELECT id, nome, moeda, saldo_atual, saldo_freebet, saldo_bonus,
               saldo_irrecuperavel, parceiro_id, bookmaker_catalogo_id
        FROM bookmakers
        WHERE projeto_id = p_projeto_id
      ) bk
    ),
    
    'giros_gratis', (SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) FROM (SELECT * FROM giros_gratis WHERE projeto_id = p_projeto_id AND status = 'confirmado') g),
    'cashback', (SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) FROM (SELECT * FROM cashback_manual WHERE projeto_id = p_projeto_id) c),
    'perdas', (SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) FROM (SELECT * FROM projeto_perdas WHERE projeto_id = p_projeto_id) p),
    'bonus', (SELECT COALESCE(jsonb_agg(b), '[]'::jsonb) FROM (SELECT * FROM project_bookmaker_link_bonuses WHERE project_id = p_projeto_id AND status IN ('credited', 'finalized')) b),
    
    -- ADICIONADO: Blocos fundamentais para Lucro Realizado e Lucro Operacional (Extras)
    'ledger_extras', (
        SELECT COALESCE(jsonb_agg(le), '[]'::jsonb) 
        FROM (
            SELECT * FROM cash_ledger 
            WHERE projeto_id_snapshot = p_projeto_id 
              AND status = 'CONFIRMADO'
        ) le
    ),
    'depositos', (
        SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) 
        FROM (
            SELECT * FROM cash_ledger 
            WHERE projeto_id_snapshot = p_projeto_id 
              AND tipo_transacao IN ('DEPOSITO', 'DEPOSITO_VIRTUAL')
              AND status = 'CONFIRMADO'
        ) d
    ),
    'saques', (
        SELECT COALESCE(jsonb_agg(s), '[]'::jsonb) 
        FROM (
            SELECT * FROM cash_ledger 
            WHERE projeto_id_snapshot = p_projeto_id 
              AND tipo_transacao IN ('SAQUE', 'SAQUE_VIRTUAL')
              AND status = 'CONFIRMADO'
        ) s
    ),
    'conciliacoes', (
        SELECT COALESCE(jsonb_agg(ba), '[]'::jsonb) 
        FROM (
            SELECT ba.*, b.moeda 
            FROM bookmaker_balance_audit ba
            JOIN bookmakers b ON b.id = ba.bookmaker_id
            WHERE ba.referencia_tipo = 'projeto' 
              AND ba.referencia_id = p_projeto_id
              AND ba.origem = 'CONCILIACAO_VINCULO'
        ) ba
    )
  );

  RETURN result;
END;
$function$;

-- 2. Refinar get_projeto_lucro_operacional_daily para usar cotacao_trabalho como fallback real
CREATE OR REPLACE FUNCTION public.get_projeto_lucro_operacional_daily(p_projeto_id uuid, p_cotacoes jsonb DEFAULT '{}'::jsonb, p_data_inicio text DEFAULT NULL::text, p_data_fim text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_start_date date;
  v_end_date date;
  v_moeda_consolidacao text;
  v_cotacao_trabalho numeric;
  v_bm_ids uuid[];
  v_daily jsonb;
BEGIN
  SELECT p.moeda_consolidacao, p.cotacao_trabalho INTO v_moeda_consolidacao, v_cotacao_trabalho
  FROM projetos p WHERE p.id = p_projeto_id;

  IF v_moeda_consolidacao IS NULL THEN v_moeda_consolidacao := 'BRL'; END IF;
  IF v_cotacao_trabalho IS NULL OR v_cotacao_trabalho <= 0 THEN v_cotacao_trabalho := 5.0; END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_bm_ids
  FROM bookmakers WHERE projeto_id = p_projeto_id;

  IF p_data_inicio IS NOT NULL THEN
    v_start_ts := (p_data_inicio || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_start_date := p_data_inicio::date;
  END IF;
  IF p_data_fim IS NOT NULL THEN
    v_end_ts := (p_data_fim || ' 23:59:59.999')::timestamp AT TIME ZONE 'America/Sao_Paulo';
    v_end_date := p_data_fim::date;
  END IF;

  WITH
  apostas_daily AS (
    SELECT
      (a.data_aposta AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE
        WHEN a.pl_consolidado IS NOT NULL AND COALESCE(a.consolidation_currency, v_moeda_consolidacao) = v_moeda_consolidacao THEN v_moeda_consolidacao
        WHEN a.lucro_prejuizo_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN 'BRL'
        WHEN UPPER(COALESCE(a.moeda_operacao, 'BRL')) IN ('USDT', 'USDC') THEN 'USD'
        ELSE UPPER(COALESCE(a.moeda_operacao, 'BRL'))
      END AS moeda,
      CASE
        WHEN a.pl_consolidado IS NOT NULL AND COALESCE(a.consolidation_currency, v_moeda_consolidacao) = v_moeda_consolidacao THEN COALESCE(a.pl_consolidado, 0)
        WHEN a.lucro_prejuizo_brl_referencia IS NOT NULL AND v_moeda_consolidacao = 'BRL' THEN COALESCE(a.lucro_prejuizo_brl_referencia, 0)
        ELSE COALESCE(a.lucro_prejuizo, 0)
      END AS val
    FROM apostas_unificada a
    WHERE a.projeto_id = p_projeto_id AND a.status = 'LIQUIDADA' AND a.cancelled_at IS NULL
      AND (v_start_ts IS NULL OR a.data_aposta >= v_start_ts) AND (v_end_ts IS NULL OR a.data_aposta <= v_end_ts)
  ),
  -- Outras CTEs omitidas para brevidade, focando na agregação que usa a cotação
  cashback_daily AS (SELECT c.data_credito AS dia, CASE WHEN UPPER(COALESCE(c.moeda_operacao, 'BRL')) IN ('USDT', 'USDC') THEN 'USD' ELSE UPPER(COALESCE(c.moeda_operacao, 'BRL')) END AS moeda, COALESCE(c.valor, 0) AS val FROM cashback_manual c WHERE c.projeto_id = p_projeto_id AND (v_start_date IS NULL OR c.data_credito >= v_start_date) AND (v_end_date IS NULL OR c.data_credito <= v_end_date)),
  giros_daily AS (SELECT (g.data_registro AT TIME ZONE 'America/Sao_Paulo')::date AS dia, CASE WHEN UPPER(COALESCE(b.moeda, 'BRL')) IN ('USDT', 'USDC') THEN 'USD' ELSE UPPER(COALESCE(b.moeda, 'BRL')) END AS moeda, GREATEST(COALESCE(g.valor_retorno, 0), 0) AS val FROM giros_gratis g JOIN bookmakers b ON b.id = g.bookmaker_id WHERE g.projeto_id = p_projeto_id AND g.status = 'confirmado' AND (v_start_ts IS NULL OR g.data_registro >= v_start_ts) AND (v_end_ts IS NULL OR g.data_registro <= v_end_ts)),
  bonus_daily AS (SELECT (bl.credited_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, CASE WHEN COALESCE(bl.valor_consolidado_snapshot, 0) > 0 THEN v_moeda_consolidacao WHEN UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) IN ('USDT', 'USDC') THEN 'USD' ELSE UPPER(COALESCE(bl.currency, b.moeda, 'BRL')) END AS moeda, CASE WHEN COALESCE(bl.valor_consolidado_snapshot, 0) > 0 THEN COALESCE(bl.valor_consolidado_snapshot, 0) ELSE COALESCE(bl.bonus_amount, 0) END AS val FROM project_bookmaker_link_bonuses bl LEFT JOIN bookmakers b ON b.id = bl.bookmaker_id WHERE bl.project_id = p_projeto_id AND bl.status IN ('credited', 'finalized') AND (v_start_ts IS NULL OR bl.credited_at >= v_start_ts) AND (v_end_ts IS NULL OR bl.credited_at <= v_end_ts)),
  perdas_cancel_daily AS (
    SELECT
      (cl.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USDT', 'USDC') THEN 'USD' ELSE UPPER(COALESCE(cl.moeda, 'BRL')) END AS moeda,
      -COALESCE((cl.auditoria_metadata::jsonb ->> 'valor_perdido')::numeric, cl.valor, 0) AS val
    FROM cash_ledger cl
    WHERE cl.ajuste_motivo = 'BONUS_CANCELAMENTO' AND cl.ajuste_direcao = 'SAIDA' AND cl.status = 'CONFIRMADO'
      AND (cl.projeto_id_snapshot = p_projeto_id OR cl.origem_bookmaker_id = ANY(v_bm_ids))
      AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts) AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
  ),
  all_events AS (
    SELECT dia, moeda, val FROM apostas_daily
    UNION ALL SELECT dia, moeda, val FROM cashback_daily
    UNION ALL SELECT dia, moeda, val FROM giros_daily
    UNION ALL SELECT dia, moeda, val FROM bonus_daily
    UNION ALL SELECT dia, moeda, val FROM perdas_cancel_daily
  ),
  daily_agg AS (
    SELECT
      e.dia,
      SUM(
        CASE
          WHEN e.moeda = v_moeda_consolidacao THEN e.val
          WHEN e.moeda IN ('USD', 'USDT', 'USDC') AND v_moeda_consolidacao = 'BRL' THEN
            e.val * COALESCE((p_cotacoes ->> 'USD')::numeric, v_cotacao_trabalho)
          WHEN e.moeda = 'BRL' AND v_moeda_consolidacao IN ('USD', 'USDT', 'USDC') THEN
            e.val / COALESCE((p_cotacoes ->> 'USD')::numeric, v_cotacao_trabalho)
          WHEN p_cotacoes ? e.moeda THEN e.val * (p_cotacoes ->> e.moeda)::numeric
          ELSE e.val
        END
      ) AS lucro
    FROM all_events e
    GROUP BY e.dia
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('dia', d.dia::text, 'lucro', ROUND(d.lucro, 2)) ORDER BY d.dia), '[]'::jsonb)
  INTO v_daily FROM daily_agg d WHERE ABS(d.lucro) >= 0.01;
  RETURN v_daily;
END;
$function$;