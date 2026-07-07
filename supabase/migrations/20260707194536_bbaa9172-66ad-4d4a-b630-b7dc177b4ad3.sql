DROP FUNCTION IF EXISTS public.get_valuebet_projects_summary();
DROP FUNCTION IF EXISTS public.get_valuebet_projects_summary(uuid);

CREATE OR REPLACE FUNCTION public.get_valuebet_projects_summary(p_workspace_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_workspace_id uuid;
    v_can_access boolean := false;
    v_result json;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN '[]'::json;
    END IF;

    v_workspace_id := COALESCE(p_workspace_id, public.get_user_workspace(v_user_id));

    IF v_workspace_id IS NULL THEN
        RETURN '[]'::json;
    END IF;

    SELECT (
        public.is_system_owner(v_user_id)
        OR EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.user_id = v_user_id
              AND wm.workspace_id = v_workspace_id
              AND wm.is_active = true
        )
    ) INTO v_can_access;

    IF NOT v_can_access THEN
        RETURN '[]'::json;
    END IF;

    WITH project_stats AS (
        SELECT
            p.id as projeto_id,
            p.nome,
            COUNT(*)::integer as total_bets,
            COUNT(*) FILTER (WHERE a.status = 'LIQUIDADA')::integer as liquidadas,
            MAX(a.data_aposta) as ultima_data
        FROM public.projetos p
        JOIN public.apostas_unificada a ON a.projeto_id = p.id
        WHERE p.workspace_id = v_workspace_id
          AND a.workspace_id = v_workspace_id
          AND a.estrategia = 'VALUEBET'
        GROUP BY p.id, p.nome
        ORDER BY total_bets DESC, p.nome ASC
    )
    SELECT json_agg(project_stats) INTO v_result FROM project_stats;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_valuebet_projects_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_valuebet_projects_summary(uuid) TO service_role;