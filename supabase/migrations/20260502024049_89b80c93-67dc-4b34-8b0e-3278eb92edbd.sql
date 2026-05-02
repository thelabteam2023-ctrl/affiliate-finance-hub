CREATE OR REPLACE FUNCTION public.get_cash_ledger_tags(p_workspace_id UUID)
RETURNS TEXT[] AS $$
DECLARE
    tags_list TEXT[];
BEGIN
    SELECT array_agg(DISTINCT tag)
    FROM (
        SELECT unnest(tags) as tag
        FROM public.cash_ledger
        WHERE workspace_id = p_workspace_id
        AND tags IS NOT NULL
        AND tags != '{}'
    ) sub
    INTO tags_list;

    RETURN COALESCE(tags_list, '{}'::TEXT[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
