import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-workspace-id',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[aggregate-daily-influence] Starting daily aggregation...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD format

    console.log(`[aggregate-daily-influence] Aggregating for date: ${targetDate}`);

    // Call the aggregation function
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
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[aggregate-daily-influence] Fatal error:', errorMessage);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
