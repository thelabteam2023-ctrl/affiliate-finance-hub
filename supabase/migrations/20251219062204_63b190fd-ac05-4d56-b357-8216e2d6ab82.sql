-- =============================================
-- 1) Add public_id to profiles table for user IDs
-- =============================================

-- Add the column
ALTER TABLE public.profiles 
ADD COLUMN public_id VARCHAR(4) UNIQUE;

-- Create a sequence for generating IDs
CREATE SEQUENCE public.profiles_public_id_seq
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 9999
  CYCLE;

-- Function to generate next public_id
CREATE OR REPLACE FUNCTION public.generate_public_id()
RETURNS VARCHAR(4)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_val INTEGER;
  v_id VARCHAR(4);
  v_exists BOOLEAN;
BEGIN
  -- Get next value from sequence
  v_next_val := nextval('profiles_public_id_seq');
  v_id := LPAD(v_next_val::TEXT, 4, '0');
  
  -- Check if this ID already exists (in case of manual assignments)
  SELECT EXISTS(SELECT 1 FROM profiles WHERE public_id = v_id) INTO v_exists;
  
  -- If exists, keep trying next values
  WHILE v_exists LOOP
    v_next_val := nextval('profiles_public_id_seq');
    v_id := LPAD(v_next_val::TEXT, 4, '0');
    SELECT EXISTS(SELECT 1 FROM profiles WHERE public_id = v_id) INTO v_exists;
  END LOOP;
  
  RETURN v_id;
END;
$$;

-- Trigger function to auto-generate public_id on insert
CREATE OR REPLACE FUNCTION public.trigger_set_public_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.public_id IS NULL THEN
    NEW.public_id := generate_public_id();
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for new users
CREATE TRIGGER set_profile_public_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_public_id();

-- =============================================
-- 2) Backfill existing users (ordered by created_at)
-- =============================================

DO $$
DECLARE
  r RECORD;
  v_counter INTEGER := 0;
BEGIN
  -- Loop through all users ordered by created_at
  FOR r IN (
    SELECT id 
    FROM profiles 
    WHERE public_id IS NULL
    ORDER BY created_at ASC
  ) LOOP
    v_counter := v_counter + 1;
    UPDATE profiles SET public_id = LPAD(v_counter::TEXT, 4, '0') WHERE id = r.id;
  END LOOP;
  
  -- Update sequence to current position
  IF v_counter > 0 THEN
    PERFORM setval('profiles_public_id_seq', v_counter, true);
  END IF;
END $$;

-- =============================================
-- 3) RPC function to find workspaces by owner emails (System Owner only)
-- =============================================

CREATE OR REPLACE FUNCTION public.admin_find_workspaces_by_owner_emails(p_emails TEXT[])
RETURNS TABLE(
  workspace_id UUID,
  workspace_name TEXT,
  owner_email TEXT,
  is_owner BOOLEAN,
  is_member BOOLEAN,
  member_workspaces TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_emails TEXT[];
BEGIN
  -- Check if caller is system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;
  
  -- Normalize emails: lowercase, trim, remove empty
  SELECT ARRAY_AGG(DISTINCT LOWER(TRIM(e)))
  INTO normalized_emails
  FROM UNNEST(p_emails) e
  WHERE TRIM(e) != '';
  
  -- Return workspaces where user is owner
  RETURN QUERY
  WITH email_profiles AS (
    -- Find profiles matching emails
    SELECT p.id, LOWER(p.email) as email
    FROM profiles p
    WHERE LOWER(p.email) = ANY(normalized_emails)
  ),
  owner_workspaces AS (
    -- Find workspaces where these users are owners
    SELECT 
      w.id as ws_id,
      w.name as ws_name,
      ep.email as owner_email
    FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    JOIN email_profiles ep ON wm.user_id = ep.id
    WHERE wm.role = 'owner' AND wm.is_active = true
  ),
  member_workspaces AS (
    -- Find workspaces where these users are members (not owners)
    SELECT 
      ep.email,
      ARRAY_AGG(w.name) as ws_names
    FROM workspace_members wm
    JOIN email_profiles ep ON wm.user_id = ep.id
    JOIN workspaces w ON wm.workspace_id = w.id
    WHERE wm.role != 'owner' AND wm.is_active = true
    GROUP BY ep.email
  )
  SELECT 
    ow.ws_id,
    ow.ws_name,
    ow.owner_email,
    TRUE as is_owner,
    FALSE as is_member,
    NULL::TEXT[] as member_workspaces
  FROM owner_workspaces ow
  
  UNION ALL
  
  -- Also return emails that are members but not owners (for feedback)
  SELECT 
    NULL::UUID as workspace_id,
    NULL::TEXT as workspace_name,
    mw.email as owner_email,
    FALSE as is_owner,
    TRUE as is_member,
    mw.ws_names as member_workspaces
  FROM member_workspaces mw
  WHERE mw.email NOT IN (SELECT owner_email FROM owner_workspaces);
END;
$$;