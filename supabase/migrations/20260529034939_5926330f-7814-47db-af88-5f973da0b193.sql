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
        -- Busca TUDO que remotamente pareça VALUEBET no projeto, ignorando workspace para auditoria
        SELECT 
            workspace_id,
            estrategia,
            status,
            projeto_id
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
    )
    SELECT json_build_object(
        'wrong_workspace', COALESCE((SELECT count FROM categorized WHERE category = 'wrong_workspace'), 0),
        'wrong_case', COALESCE((SELECT count FROM categorized WHERE category = 'wrong_case'), 0),
        'pending', COALESCE((SELECT count FROM categorized WHERE category = 'pending'), 0),
        'excluded_status', COALESCE((SELECT count FROM categorized WHERE category = 'excluded_status'), 0),
        'healthy', COALESCE((SELECT count FROM categorized WHERE category = 'healthy'), 0)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.audit_valuebet_integrity(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_valuebet_integrity(uuid[]) TO service_role;