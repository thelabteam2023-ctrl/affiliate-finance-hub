-- Add max_users column if not exists
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS max_users integer NOT NULL DEFAULT 1;

-- Create function to get plan entitlements
CREATE OR REPLACE FUNCTION get_plan_entitlements(plan_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN CASE plan_name
    WHEN 'free' THEN jsonb_build_object(
      'max_active_partners', 3,
      'max_users', 1,
      'custom_permissions_enabled', false,
      'max_custom_permissions', 0,
      'personalized_support', false
    )
    WHEN 'starter' THEN jsonb_build_object(
      'max_active_partners', 10,
      'max_users', 1,
      'custom_permissions_enabled', false,
      'max_custom_permissions', 0,
      'personalized_support', false
    )
    WHEN 'pro' THEN jsonb_build_object(
      'max_active_partners', 20,
      'max_users', 2,
      'custom_permissions_enabled', true,
      'max_custom_permissions', 5,
      'personalized_support', false
    )
    WHEN 'advanced' THEN jsonb_build_object(
      'max_active_partners', 9999,
      'max_users', 15,
      'custom_permissions_enabled', true,
      'max_custom_permissions', 9999,
      'personalized_support', true
    )
    ELSE jsonb_build_object(
      'max_active_partners', 3,
      'max_users', 1,
      'custom_permissions_enabled', false,
      'max_custom_permissions', 0,
      'personalized_support', false
    )
  END;
END;
$$;

-- Create function to check plan limit for partners
CREATE OR REPLACE FUNCTION check_partner_limit(workspace_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_entitlements jsonb;
  v_active_count integer;
  v_max_active integer;
BEGIN
  -- Get workspace plan
  SELECT plan INTO v_plan FROM workspaces WHERE id = workspace_uuid;
  
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Workspace not found');
  END IF;
  
  -- Get entitlements
  v_entitlements := get_plan_entitlements(v_plan);
  v_max_active := (v_entitlements->>'max_active_partners')::integer;
  
  -- Count active partners
  SELECT COUNT(*) INTO v_active_count 
  FROM parceiros 
  WHERE workspace_id = workspace_uuid 
    AND status = 'ativo';
  
  RETURN jsonb_build_object(
    'allowed', v_active_count < v_max_active,
    'current', v_active_count,
    'limit', v_max_active,
    'plan', v_plan
  );
END;
$$;

-- Create function to check user limit
CREATE OR REPLACE FUNCTION check_user_limit(workspace_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_entitlements jsonb;
  v_active_count integer;
  v_max_users integer;
BEGIN
  -- Get workspace plan
  SELECT plan INTO v_plan FROM workspaces WHERE id = workspace_uuid;
  
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Workspace not found');
  END IF;
  
  -- Get entitlements
  v_entitlements := get_plan_entitlements(v_plan);
  v_max_users := (v_entitlements->>'max_users')::integer;
  
  -- Count active members
  SELECT COUNT(*) INTO v_active_count 
  FROM workspace_members 
  WHERE workspace_id = workspace_uuid 
    AND is_active = true;
  
  RETURN jsonb_build_object(
    'allowed', v_active_count < v_max_users,
    'current', v_active_count,
    'limit', v_max_users,
    'plan', v_plan
  );
END;
$$;

-- Create function to check custom permissions limit
CREATE OR REPLACE FUNCTION check_custom_permissions_limit(workspace_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_entitlements jsonb;
  v_current_count integer;
  v_max_permissions integer;
  v_enabled boolean;
BEGIN
  -- Get workspace plan
  SELECT plan INTO v_plan FROM workspaces WHERE id = workspace_uuid;
  
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Workspace not found');
  END IF;
  
  -- Get entitlements
  v_entitlements := get_plan_entitlements(v_plan);
  v_enabled := (v_entitlements->>'custom_permissions_enabled')::boolean;
  v_max_permissions := (v_entitlements->>'max_custom_permissions')::integer;
  
  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'enabled', false,
      'current', 0,
      'limit', 0,
      'plan', v_plan
    );
  END IF;
  
  -- Count active permission overrides
  SELECT COUNT(*) INTO v_current_count 
  FROM user_permission_overrides 
  WHERE workspace_id = workspace_uuid 
    AND granted = true;
  
  RETURN jsonb_build_object(
    'allowed', v_current_count < v_max_permissions,
    'enabled', true,
    'current', v_current_count,
    'limit', v_max_permissions,
    'plan', v_plan
  );
END;
$$;

-- Create function to get full workspace usage
CREATE OR REPLACE FUNCTION get_workspace_usage(workspace_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_entitlements jsonb;
  v_partners_count integer;
  v_users_count integer;
  v_permissions_count integer;
BEGIN
  -- Get workspace plan
  SELECT plan INTO v_plan FROM workspaces WHERE id = workspace_uuid;
  
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('error', 'Workspace not found');
  END IF;
  
  -- Get entitlements
  v_entitlements := get_plan_entitlements(v_plan);
  
  -- Count active partners
  SELECT COUNT(*) INTO v_partners_count 
  FROM parceiros 
  WHERE workspace_id = workspace_uuid 
    AND status = 'ativo';
  
  -- Count active members
  SELECT COUNT(*) INTO v_users_count 
  FROM workspace_members 
  WHERE workspace_id = workspace_uuid 
    AND is_active = true;
  
  -- Count active permission overrides
  SELECT COUNT(*) INTO v_permissions_count 
  FROM user_permission_overrides 
  WHERE workspace_id = workspace_uuid 
    AND granted = true;
  
  RETURN jsonb_build_object(
    'plan', v_plan,
    'entitlements', v_entitlements,
    'usage', jsonb_build_object(
      'active_partners', v_partners_count,
      'active_users', v_users_count,
      'custom_permissions', v_permissions_count
    )
  );
END;
$$;

-- Update existing workspaces max values based on plan
UPDATE workspaces SET 
  max_active_partners = CASE plan
    WHEN 'free' THEN 3
    WHEN 'starter' THEN 10
    WHEN 'pro' THEN 20
    WHEN 'advanced' THEN 9999
    ELSE 3
  END,
  max_users = CASE plan
    WHEN 'free' THEN 1
    WHEN 'starter' THEN 1
    WHEN 'pro' THEN 2
    WHEN 'advanced' THEN 15
    ELSE 1
  END;