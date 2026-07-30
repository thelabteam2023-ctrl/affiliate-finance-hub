CREATE OR REPLACE FUNCTION public.get_resumo_perdas(p_workspace_id uuid, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ws uuid;
  v_result json;
  v_usd_brl numeric;
BEGIN
  v_ws := COALESCE(p_workspace_id, get_current_workspace());
  IF v_ws IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NO_WORKSPACE', 'total_usd', 0, 'total_count', 0, 'breakdown', '[]'::json);
  END IF;

  SELECT rate INTO v_usd_brl
  FROM exchange_rate_history
  WHERE currency_pair = 'USDBRL'
  ORDER BY fetched_at DESC
  LIMIT 1;

  v_usd_brl := COALESCE(NULLIF(v_usd_brl, 0), 5.0);

  RETURN (
    WITH base AS (
      SELECT
        cl.id,
        CASE
          WHEN cl.tipo_transacao = 'PERDA_ATIVO' THEN 'PERDA_ATIVO'
          WHEN cl.tipo_transacao = 'PERDA_OPERACIONAL' THEN 'PERDA_SCAN'
          WHEN cl.tipo_transacao = 'PERDA_CAMBIAL' THEN 'PERDA_CAMBIAL'
        END AS categoria,
        CASE
          -- 1) valor_usd já normalizado
          WHEN COALESCE(cl.valor_usd, 0) <> 0 THEN ABS(cl.valor_usd)
          -- 2) moedas dólar-equivalentes
          WHEN UPPER(COALESCE(cl.moeda, 'BRL')) IN ('USD','USDT','USDC') THEN ABS(COALESCE(cl.valor, 0))
          -- 3) BRL -> USD
          WHEN UPPER(COALESCE(cl.moeda, 'BRL')) = 'BRL' THEN ABS(COALESCE(cl.valor, 0)) / v_usd_brl
          -- 4) outras moedas -> BRL (cotação da data) -> USD
          ELSE ABS(COALESCE(cl.valor, 0)) * COALESCE(fx.rate, v_usd_brl) / v_usd_brl
        END AS valor_usd_abs
      FROM cash_ledger cl
      LEFT JOIN LATERAL (
        SELECT h.rate
        FROM exchange_rate_history h
        WHERE h.currency_pair = UPPER(COALESCE(cl.moeda, 'BRL')) || 'BRL'
          AND h.fetched_at <= COALESCE(cl.data_transacao, cl.created_at, now()) + interval '1 day'
        ORDER BY h.fetched_at DESC
        LIMIT 1
      ) fx ON true
      WHERE cl.workspace_id = v_ws
        AND cl.status = 'CONFIRMADO'
        AND cl.reversed_at IS NULL
        AND cl.tipo_transacao IN ('PERDA_ATIVO','PERDA_OPERACIONAL','PERDA_CAMBIAL')
        AND (p_start IS NULL OR cl.data_transacao >= p_start)
        AND (p_end   IS NULL OR cl.data_transacao <  p_end)
    ),
    agg AS (
      SELECT categoria, SUM(valor_usd_abs) AS total_usd, COUNT(*) AS qtd
      FROM base
      WHERE categoria IS NOT NULL
      GROUP BY categoria
    )
    SELECT json_build_object(
      'total_usd', COALESCE((SELECT SUM(valor_usd_abs) FROM base), 0),
      'total_count', COALESCE((SELECT COUNT(*) FROM base), 0),
      'usd_brl', v_usd_brl,
      'breakdown', COALESCE((
        SELECT json_agg(json_build_object('categoria', categoria, 'total_usd', total_usd, 'count', qtd))
        FROM agg
      ), '[]'::json)
    )
  );
END;
$function$;