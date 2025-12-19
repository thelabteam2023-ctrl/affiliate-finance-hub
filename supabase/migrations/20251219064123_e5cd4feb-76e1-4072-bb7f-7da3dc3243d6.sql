-- Criar função para resolver workspaces por owner identifiers (IDs ou emails)
CREATE OR REPLACE FUNCTION public.admin_resolve_workspaces_by_owner_identifiers(p_tokens text[])
RETURNS TABLE(
  token text,
  token_type text,
  status text,
  owner_id uuid,
  owner_public_id character varying(4),
  owner_email text,
  workspace_id uuid,
  workspace_name text,
  workspace_plan text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text;
  v_normalized text;
  v_is_id boolean;
  v_is_email boolean;
  v_owner_uuid uuid;
  v_owner_pid varchar(4);
  v_owner_mail text;
BEGIN
  -- Check if caller is system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  -- Iterate over each token
  FOREACH v_token IN ARRAY p_tokens
  LOOP
    -- Normalize
    v_normalized := LOWER(TRIM(v_token));
    
    -- Skip empty
    IF v_normalized = '' THEN
      CONTINUE;
    END IF;
    
    -- Classify token
    v_is_id := v_normalized ~ '^\d{4}$';
    v_is_email := v_normalized ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$';
    
    -- If invalid format
    IF NOT v_is_id AND NOT v_is_email THEN
      RETURN QUERY SELECT 
        v_token::text,
        'invalid'::text,
        'invalid_format'::text,
        NULL::uuid,
        NULL::varchar(4),
        NULL::text,
        NULL::uuid,
        NULL::text,
        NULL::text;
      CONTINUE;
    END IF;
    
    -- Find owner by ID or email
    v_owner_uuid := NULL;
    v_owner_pid := NULL;
    v_owner_mail := NULL;
    
    IF v_is_id THEN
      SELECT p.id, p.public_id, p.email 
      INTO v_owner_uuid, v_owner_pid, v_owner_mail
      FROM profiles p
      WHERE p.public_id = v_normalized;
    ELSE
      SELECT p.id, p.public_id, p.email 
      INTO v_owner_uuid, v_owner_pid, v_owner_mail
      FROM profiles p
      WHERE LOWER(p.email) = v_normalized;
    END IF;
    
    -- If owner not found
    IF v_owner_uuid IS NULL THEN
      RETURN QUERY SELECT 
        v_token::text,
        CASE WHEN v_is_id THEN 'id' ELSE 'email' END::text,
        'not_found'::text,
        NULL::uuid,
        NULL::varchar(4),
        NULL::text,
        NULL::uuid,
        NULL::text,
        NULL::text;
      CONTINUE;
    END IF;
    
    -- Find workspaces where this user is owner
    -- Using workspace_members with role = 'owner'
    IF EXISTS (
      SELECT 1 FROM workspace_members wm 
      WHERE wm.user_id = v_owner_uuid AND wm.role = 'owner' AND wm.is_active = true
    ) THEN
      RETURN QUERY 
      SELECT 
        v_token::text,
        CASE WHEN v_is_id THEN 'id' ELSE 'email' END::text,
        'found'::text,
        v_owner_uuid,
        v_owner_pid,
        v_owner_mail,
        w.id,
        w.name,
        w.plan
      FROM workspaces w
      INNER JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE wm.user_id = v_owner_uuid 
        AND wm.role = 'owner' 
        AND wm.is_active = true;
    ELSE
      -- User exists but has no workspace as owner
      RETURN QUERY SELECT 
        v_token::text,
        CASE WHEN v_is_id THEN 'id' ELSE 'email' END::text,
        'no_workspace'::text,
        v_owner_uuid,
        v_owner_pid,
        v_owner_mail,
        NULL::uuid,
        NULL::text,
        NULL::text;
    END IF;
  END LOOP;
END;
$$;