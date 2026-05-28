CREATE OR REPLACE FUNCTION public.get_current_workspace()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hdr AS (
    SELECT public.try_cast_uuid(
      (coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-workspace-id')
    ) AS wid
  ),
  caller AS (
    SELECT
      auth.uid() AS uid,
      COALESCE((SELECT is_system_owner FROM public.profiles WHERE id = auth.uid()), false) AS is_owner
  )
  SELECT COALESCE(
    (SELECT h.wid FROM hdr h, caller c
      WHERE h.wid IS NOT NULL AND c.is_owner = true),
    (SELECT h.wid FROM hdr h, caller c
      WHERE h.wid IS NOT NULL AND c.is_owner = false
        AND public.is_active_workspace_member(c.uid, h.wid)),
    (SELECT default_workspace_id FROM public.profiles WHERE id = auth.uid()),
    (SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND is_active = true
      ORDER BY created_at ASC LIMIT 1)
  );
$$;

DROP FUNCTION IF EXISTS public.get_identity_diagnostic();

CREATE OR REPLACE FUNCTION public.get_identity_diagnostic()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_header_raw text;
  v_header_uuid uuid;
  v_resolved uuid;
  v_email text;
  v_is_owner boolean;
  v_header_is_member boolean;
  v_resolved_name text;
  v_header_name text;
BEGIN
  v_header_raw := coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-workspace-id';
  v_header_uuid := public.try_cast_uuid(v_header_raw);
  v_resolved := public.get_current_workspace();

  SELECT email, COALESCE(is_system_owner, false)
    INTO v_email, v_is_owner
    FROM public.profiles WHERE id = v_uid;

  IF v_header_uuid IS NOT NULL THEN
    v_header_is_member := public.is_active_workspace_member(v_uid, v_header_uuid);
    SELECT name INTO v_header_name FROM public.workspaces WHERE id = v_header_uuid;
  END IF;

  IF v_resolved IS NOT NULL THEN
    SELECT name INTO v_resolved_name FROM public.workspaces WHERE id = v_resolved;
  END IF;

  RETURN jsonb_build_object(
    'auth_uid', v_uid,
    'email', v_email,
    'is_system_owner', v_is_owner,
    'header_raw', v_header_raw,
    'header_uuid', v_header_uuid,
    'header_workspace_name', v_header_name,
    'header_is_active_member', v_header_is_member,
    'resolved_workspace_id', v_resolved,
    'resolved_workspace_name', v_resolved_name,
    'header_matches_resolved', (v_header_uuid IS NOT NULL AND v_header_uuid = v_resolved),
    'checked_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_identity_diagnostic() TO authenticated;