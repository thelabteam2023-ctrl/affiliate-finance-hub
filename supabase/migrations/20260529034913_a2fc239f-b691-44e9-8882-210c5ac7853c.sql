DROP FUNCTION IF EXISTS public.get_valuebet_lab_stats(uuid[], date, date);

CREATE OR REPLACE FUNCTION public.get_valuebet_lab_stats(
    p_project_ids uuid[], 
    p_start_date date DEFAULT NULL::date, 
    p_end_date date DEFAULT NULL::date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_workspace_id UUID;
    v_result JSON;
BEGIN
    v_workspace_id := public.get_user_workspace(auth.uid());

    WITH filtered_bets AS (
        SELECT 
            *,
            public.fn_get_market_group(mercado) as mercado_grupo,
            CASE 
                WHEN odd < 1.50 THEN '1.00 - 1.49'
                WHEN odd < 2.00 THEN '1.50 - 1.99'
                WHEN odd < 3.00 THEN '2.00 - 2.99'
                ELSE '3.00+'
            END as faixa_odd,
            -- Usar stake_consolidado como volume primário, fallback para valor_brl_referencia
            COALESCE(stake_consolidado, valor_brl_referencia, stake_total, 0) as volume_real
        FROM public.apostas_unificada
        WHERE workspace_id = v_workspace_id
          AND estrategia = 'VALUEBET'
          AND (p_project_ids IS NULL OR projeto_id = ANY(p_project_ids))
          AND (p_start_date IS NULL OR data_aposta::date >= p_start_date)
          AND (p_end_date IS NULL OR data_aposta::date <= p_end_date)
          AND status IN ('LIQUIDADA', 'WON', 'LOST', 'SETTLED', 'HALF_WON', 'HALF_LOST')
    ),
    kpis AS (
        SELECT 
            COUNT(*) as total_bets,
            COALESCE(SUM(volume_real), 0) as volume,
            COALESCE(SUM(lucro_prejuizo_brl_referencia), 0) as profit,
            CASE WHEN SUM(volume_real) > 0 
                 THEN (SUM(lucro_prejuizo_brl_referencia) / SUM(volume_real)) * 100 
                 ELSE 0 END as roi,
            CASE WHEN COUNT(*) > 0 
                 THEN (COUNT(*) FILTER (WHERE resultado IN ('GREEN', 'HALF_GREEN'))::FLOAT / COUNT(*)) * 100 
                 ELSE 0 END as win_rate
        FROM filtered_bets
    ),
    market_perf AS (
        SELECT 
            mercado_grupo,
            COUNT(*) as count,
            COALESCE(SUM(lucro_prejuizo_brl_referencia), 0) as profit
        FROM filtered_bets
        GROUP BY mercado_grupo
    ),
    odd_perf AS (
        SELECT 
            faixa_odd,
            COUNT(*) as count,
            COALESCE(SUM(lucro_prejuizo_brl_referencia), 0) as profit
        FROM filtered_bets
        GROUP BY faixa_odd
    ),
    evolution AS (
        SELECT 
            data_aposta::date as date,
            COALESCE(SUM(lucro_prejuizo_brl_referencia), 0) as daily_profit
        FROM filtered_bets
        GROUP BY data_aposta::date
        ORDER BY data_aposta::date
    )
    SELECT json_build_object(
        'kpis', (SELECT row_to_json(kpis) FROM kpis),
        'markets', COALESCE((SELECT json_agg(market_perf) FROM market_perf), '[]'::json),
        'odds', COALESCE((SELECT json_agg(odd_perf) FROM odd_perf), '[]'::json),
        'evolution', COALESCE((SELECT json_agg(evolution) FROM evolution), '[]'::json)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

-- Conceder permissões para a nova RPC
GRANT EXECUTE ON FUNCTION public.get_valuebet_lab_stats(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_valuebet_lab_stats(uuid[], date, date) TO service_role;