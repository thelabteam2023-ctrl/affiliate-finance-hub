
-- Update get_plan_entitlements function to set Advanced plan max_users to 10
CREATE OR REPLACE FUNCTION public.get_plan_entitlements(plan_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  CASE plan_name
    WHEN 'free' THEN
      RETURN jsonb_build_object(
        'max_active_partners', 3,
        'max_users', 1,
        'custom_permissions_enabled', false,
        'max_custom_permissions', 0,
        'personalized_support', false
      );
    WHEN 'starter' THEN
      RETURN jsonb_build_object(
        'max_active_partners', 10,
        'max_users', 1,
        'custom_permissions_enabled', false,
        'max_custom_permissions', 0,
        'personalized_support', false
      );
    WHEN 'pro' THEN
      RETURN jsonb_build_object(
        'max_active_partners', 20,
        'max_users', 2,
        'custom_permissions_enabled', true,
        'max_custom_permissions', 5,
        'personalized_support', false
      );
    WHEN 'advanced' THEN
      RETURN jsonb_build_object(
        'max_active_partners', 9999,
        'max_users', 10,
        'custom_permissions_enabled', true,
        'max_custom_permissions', 9999,
        'personalized_support', true
      );
    ELSE
      -- Default to free plan
      RETURN jsonb_build_object(
        'max_active_partners', 3,
        'max_users', 1,
        'custom_permissions_enabled', false,
        'max_custom_permissions', 0,
        'personalized_support', false
      );
  END CASE;
END;
$$;
