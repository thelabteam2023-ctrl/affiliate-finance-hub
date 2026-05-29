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
            -- Volume Canônico (Cotação de Trabalho Snapshot)
            COALESCE(stake_consolidado, valor_brl_referencia, stake_total, 0) as volume_real,
            -- Lucro Canônico (Cotação de Trabalho Snapshot)
            COALESCE(pl_consolidado, lucro_prejuizo, 0) as profit_real
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
            COALESCE(SUM(profit_real), 0) as profit,
            CASE WHEN SUM(volume_real) > 0 
                 THEN (SUM(profit_real) / SUM(volume_real)) * 100 
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
            COALESCE(SUM(profit_real), 0) as profit
        FROM filtered_bets
        GROUP BY mercado_grupo
    ),
    odd_perf AS (
        SELECT 
            faixa_odd,
            COUNT(*) as count,
            COALESCE(SUM(profit_real), 0) as profit
        FROM filtered_bets
        GROUP BY faixa_odd
    ),
    evolution AS (
        SELECT 
            data_aposta::date as date,
            COALESCE(SUM(profit_real), 0) as daily_profit
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

GRANT EXECUTE ON FUNCTION public.get_valuebet_lab_stats(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_valuebet_lab_stats(uuid[], date, date) TO service_role;

-- Atualizar auditoria para incluir cobertura de colunas
DROP FUNCTION IF EXISTS public.audit_valuebet_integrity(uuid[]);

CREATE OR REPLACE FUNCTION public.audit_valuebet_integrity(p_project_ids uuid[])
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

    WITH base_data AS (
        SELECT 
            workspace_id,
            estrategia,
            status,
            projeto_id,
            stake_consolidado,
            pl_consolidado
        FROM public.apostas_unificada
        WHERE (p_project_ids IS NULL OR projeto_id = ANY(p_project_ids))
          AND (UPPER(estrategia) = 'VALUEBET' OR estrategia ILIKE '%value%')
    ),
    categorized AS (
        SELECT
            CASE 
                WHEN workspace_id != v_workspace_id THEN 'wrong_workspace'
                WHEN estrategia != 'VALUEBET' THEN 'wrong_case'
                WHEN status = 'PENDENTE' THEN 'pending'
                WHEN status NOT IN ('LIQUIDADA', 'WON', 'LOST', 'SETTLED', 'HALF_WON', 'HALF_LOST') THEN 'excluded_status'
                ELSE 'healthy'
            END as category,
            COUNT(*) as count
        FROM base_data
        GROUP BY 1
    ),
    column_health AS (
        SELECT
            COUNT(*) as total,
            COUNT(stake_consolidado) as filled_stake_cons,
            COUNT(pl_consolidado) as filled_pl_cons
        FROM base_data
        WHERE workspace_id = v_workspace_id
          AND estrategia = 'VALUEBET'
          AND status IN ('LIQUIDADA', 'WON', 'LOST', 'SETTLED', 'HALF_WON', 'HALF_LOST')
    )
    SELECT json_build_object(
        'wrong_workspace', COALESCE((SELECT count FROM categorized WHERE category = 'wrong_workspace'), 0),
        'wrong_case', COALESCE((SELECT count FROM categorized WHERE category = 'wrong_case'), 0),
        'pending', COALESCE((SELECT count FROM categorized WHERE category = 'pending'), 0),
        'excluded_status', COALESCE((SELECT count FROM categorized WHERE category = 'excluded_status'), 0),
        'healthy', COALESCE((SELECT count FROM categorized WHERE category = 'healthy'), 0),
        'column_health', (SELECT row_to_json(column_health) FROM column_health)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.audit_valuebet_integrity(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_valuebet_integrity(uuid[]) TO service_role;