-- Prefer request-scoped workspace via header x-workspace-id (validated) before profile default

CREATE OR REPLACE FUNCTION public.try_cast_uuid(p_text text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN p_text::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_workspace()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH hdr AS (
    SELECT public.try_cast_uuid(
      (coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-workspace-id')
    ) AS wid
  )
  SELECT COALESCE(
    -- 1) Request-scoped header (validated membership)
    (SELECT wid FROM hdr WHERE wid IS NOT NULL AND public.is_active_workspace_member(auth.uid(), wid)),
    -- 2) Profile default
    (SELECT default_workspace_id FROM public.profiles WHERE id = auth.uid()),
    -- 3) First active membership
    (SELECT workspace_id
     FROM public.workspace_members
     WHERE user_id = auth.uid() AND is_active = true
     ORDER BY created_at ASC
     LIMIT 1)
  );
$$;