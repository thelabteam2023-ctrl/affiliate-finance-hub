CREATE OR REPLACE FUNCTION public.check_blocked_words(p_content text, p_max_severity text DEFAULT 'low'::text)
 RETURNS TABLE(word text, severity text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Se o nível for relaxed (Livre), não bloqueia absolutamente nada
    IF p_max_severity = 'relaxed' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT cbw.word, cbw.severity
    FROM public.community_blocked_words cbw
    WHERE lower(p_content) LIKE '%' || lower(cbw.word) || '%'
    AND (
        (p_max_severity = 'strict' AND cbw.severity IN ('low', 'medium', 'high', 'critical')) OR
        (p_max_severity = 'moderate' AND cbw.severity IN ('medium', 'high', 'critical'))
    )
    LIMIT 1;
END;
$function$;