-- RPC para Auditoria Profunda de Integridade
CREATE OR REPLACE FUNCTION public.audit_valuebet_integrity(p_project_ids UUID[] DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
    v_workspace_id UUID;
    v_result JSON;
BEGIN
    v_workspace_id := public.get_user_workspace(auth.uid());

    WITH raw_scan AS (
        -- Busca bruta ignorando filtros restritivos de status/case para diagnóstico
        SELECT 
            estrategia,
            status,
            workspace_id,
            projeto_id,
            COUNT(*) as total
        FROM public.apostas_unificada
        WHERE (p_project_ids IS NULL OR projeto_id = ANY(p_project_ids))
          -- Foca no que parece ser Valuebet mas pode estar "escondido"
          AND (estrategia ILIKE '%value%' OR estrategia ILIKE '%valor%')
        GROUP BY estrategia, status, workspace_id, projeto_id
    ),
    discrepancies AS (
        SELECT 
            json_agg(json_build_object(
                'estrategia', estrategia,
                'status', status,
                'workspace_match', (workspace_id = v_workspace_id),
                'count', total,
                'is_hidden', (
                    estrategia <> 'VALUEBET' OR 
                    status NOT IN ('LIQUIDADA', 'WON', 'LOST', 'SETTLED', 'HALF_WON', 'HALF_LOST') OR
                    workspace_id <> v_workspace_id
                )
            )) as issues
        FROM raw_scan
    )
    SELECT json_build_object(
        'timestamp', now(),
        'workspace_id', v_workspace_id,
        'issues', COALESCE((SELECT issues FROM discrepancies), '[]'::json)
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.audit_valuebet_integrity(UUID[]) TO authenticated;
