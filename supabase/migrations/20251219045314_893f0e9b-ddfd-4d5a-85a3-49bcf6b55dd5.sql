-- Fix admin_get_daily_revenue to properly cast dates
CREATE OR REPLACE FUNCTION public.admin_get_daily_revenue(_days integer DEFAULT 30)
RETURNS TABLE(date date, revenue numeric, sales_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Verificar se é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  RETURN QUERY
  SELECT 
    d.dt::date as date,
    COALESCE(SUM(s.amount), 0) as revenue,
    COUNT(s.id) as sales_count
  FROM generate_series(
    CURRENT_DATE - (_days || ' days')::interval,
    CURRENT_DATE,
    '1 day'::interval
  ) d(dt)
  LEFT JOIN sales_events s ON s.created_at::date = d.dt::date AND s.status = 'paid'
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$function$;