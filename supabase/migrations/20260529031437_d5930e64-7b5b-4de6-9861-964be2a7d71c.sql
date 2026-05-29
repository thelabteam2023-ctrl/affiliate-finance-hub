-- Função para normalizar grupos de mercados
CREATE OR REPLACE FUNCTION public.fn_get_market_group(p_market TEXT)
RETURNS TEXT AS $$
BEGIN
    IF p_market IS NULL THEN RETURN 'Outros'; END IF;
    
    RETURN CASE 
        WHEN p_market ILIKE ANY (ARRAY['1X2', 'Moneyline', 'Vencedor', 'Match Odds', 'Resultado Final']) THEN '1X2 / Moneyline'
        WHEN p_market ILIKE ANY (ARRAY['Handicap Asiático', 'Asian Handicap', 'AH %', 'Handicap']) THEN 'Handicap Asiático'
        WHEN p_market ILIKE ANY (ARRAY['Over/Under', 'Total de Gols', 'Gols +/-', 'Gols']) THEN 'Over/Under Gols'
        WHEN p_market ILIKE ANY (ARRAY['Escanteios', 'Corners']) THEN 'Escanteios'
        WHEN p_market ILIKE ANY (ARRAY['Ambas Marcam', 'BTTS', 'Both Teams to Score']) THEN 'Ambas Marcam'
        ELSE 'Outros'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- RPC para buscar estatísticas do Laboratório ValueBet
CREATE OR REPLACE FUNCTION public.get_valuebet_lab_stats(
    p_project_ids UUID[],
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_workspace_id UUID;
    v_result JSON;
BEGIN
    -- Obter workspace_id do JWT
    v_workspace_id := (auth.jwt() ->> 'workspace_id')::uuid;

    WITH filtered_bets AS (
        SELECT 
            *,
            public.fn_get_market_group(mercado) as mercado_grupo,
            CASE 
                WHEN odd < 1.50 THEN '1.00 - 1.49'
                WHEN odd < 2.00 THEN '1.50 - 1.99'
                WHEN odd < 3.00 THEN '2.00 - 2.99'
                ELSE '3.00+'
            END as faixa_odd
        FROM public.apostas_unificada
        WHERE workspace_id = v_workspace_id
          AND estrategia = 'ValueBet'
          AND (p_project_ids IS NULL OR projeto_id = ANY(p_project_ids))
          AND (p_start_date IS NULL OR data_aposta >= p_start_date)
          AND (p_end_date IS NULL OR data_aposta <= p_end_date)
          AND status IN ('SETTLED', 'CANCELLED', 'LOST', 'WON', 'REFUNDED', 'HALF_WON', 'HALF_LOST') -- Apenas resolvidas
    ),
    kpis AS (
        SELECT 
            COUNT(*) as total_bets,
            COALESCE(SUM(stake_brl_referencia), 0) as volume,
            COALESCE(SUM(lucro_prejuizo_brl_referencia), 0) as profit,
            CASE WHEN SUM(stake_brl_referencia) > 0 
                 THEN (SUM(lucro_prejuizo_brl_referencia) / SUM(stake_brl_referencia)) * 100 
                 ELSE 0 END as roi,
            CASE WHEN COUNT(*) > 0 
                 THEN (COUNT(*) FILTER (WHERE resultado = 'GREEN')::FLOAT / COUNT(*)) * 100 
                 ELSE 0 END as win_rate
        FROM filtered_bets
    ),
    market_perf AS (
        SELECT 
            mercado_grupo,
            COUNT(*) as count,
            SUM(lucro_prejuizo_brl_referencia) as profit
        FROM filtered_bets
        GROUP BY mercado_grupo
    ),
    odd_perf AS (
        SELECT 
            faixa_odd,
            COUNT(*) as count,
            SUM(lucro_prejuizo_brl_referencia) as profit
        FROM filtered_bets
        GROUP BY faixa_odd
    ),
    evolution AS (
        SELECT 
            data_aposta::date as date,
            SUM(lucro_prejuizo_brl_referencia) as daily_profit
        FROM filtered_bets
        GROUP BY data_aposta::date
        ORDER BY data_aposta::date
    )
    SELECT json_build_object(
        'kpis', (SELECT row_to_json(kpis) FROM kpis),
        'markets', (SELECT json_agg(market_perf) FROM market_perf),
        'odds', (SELECT json_agg(odd_perf) FROM odd_perf),
        'evolution', (SELECT json_agg(evolution) FROM evolution)
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garantir permissões
GRANT EXECUTE ON FUNCTION public.get_valuebet_lab_stats(UUID[], DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_market_group(TEXT) TO authenticated;
