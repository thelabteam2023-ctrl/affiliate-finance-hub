CREATE OR REPLACE FUNCTION public.increment_api_usage(
  p_api_name VARCHAR,
  p_period_type VARCHAR,
  p_period_key VARCHAR,
  p_credits INTEGER,
  p_has_error BOOLEAN
) RETURNS void AS $$
BEGIN
  INSERT INTO public.api_usage_summary (api_name, period_type, period_key, total_calls, total_credits, total_errors)
  VALUES (p_api_name, p_period_type, p_period_key, 1, p_credits, CASE WHEN p_has_error THEN 1 ELSE 0 END)
  ON CONFLICT (api_name, period_type, period_key) DO UPDATE SET
    total_calls = api_usage_summary.total_calls + 1,
    total_credits = api_usage_summary.total_credits + EXCLUDED.total_credits,
    total_errors = api_usage_summary.total_errors + EXCLUDED.total_errors,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
