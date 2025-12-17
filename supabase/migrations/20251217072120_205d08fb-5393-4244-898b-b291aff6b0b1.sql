
-- Update get_plan_entitlements function: Starter max_active_partners = 6
CREATE OR REPLACE FUNCTION public.get_plan_entitlements(plan_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
      'max_active_partners', 6,
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
      'max_users', 10,
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

-- Update existing starter workspaces
UPDATE workspaces SET max_active_partners = 6 WHERE plan = 'starter';
