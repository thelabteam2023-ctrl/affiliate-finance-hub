import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withMiddleware, corsHeaders, type AuthResult } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  return withMiddleware(req, 'aggregate-daily-influence', async (auth, req) => {
    console.log('[aggregate-daily-influence] Starting daily aggregation...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDate = yesterday.toISOString().split('T')[0];

    console.log(`[aggregate-daily-influence] Aggregating for date: ${targetDate}`);

    const { data, error } = await supabase.rpc('aggregate_daily_influence', {
      target_date: targetDate,
    });

    if (error) {
      console.error('[aggregate-daily-influence] Error:', error);
      throw error;
    }

    console.log(`[aggregate-daily-influence] Aggregated ${data} user records for ${targetDate}`);

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        usersProcessed: data,
        message: `Daily aggregation completed for ${targetDate}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }, { allowCron: true, skipRateLimitForCron: true });
});
