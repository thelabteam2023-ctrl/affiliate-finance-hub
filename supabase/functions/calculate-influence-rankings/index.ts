import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-workspace-id',
};

interface RankingResult {
  periodType: string;
  periodStart: string;
  periodEnd: string;
  usersRanked: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[calculate-influence-rankings] Starting ranking calculation...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for manual override
    let body: { periodType?: string; forceRecalc?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided, use defaults
    }

    const results: RankingResult[] = [];
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayOfMonth = today.getDate();
    const month = today.getMonth(); // 0 = January

    // Helper to format date as YYYY-MM-DD
    const formatDate = (d: Date): string => d.toISOString().split('T')[0];

    // Calculate periods
    const calculateWeekPeriod = () => {
      // Get last Monday and last Sunday
      const lastSunday = new Date(today);
      lastSunday.setDate(today.getDate() - dayOfWeek);
      
      const lastMonday = new Date(lastSunday);
      lastMonday.setDate(lastSunday.getDate() - 6);
      
      return {
        start: formatDate(lastMonday),
        end: formatDate(lastSunday),
      };
    };

    const calculateMonthPeriod = () => {
      // Get first and last day of previous month
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      
      return {
        start: formatDate(firstDay),
        end: formatDate(lastDay),
      };
    };

    const calculateYearPeriod = () => {
      // Get first and last day of previous year
      const firstDay = new Date(today.getFullYear() - 1, 0, 1);
      const lastDay = new Date(today.getFullYear() - 1, 11, 31);
      
      return {
        start: formatDate(firstDay),
        end: formatDate(lastDay),
      };
    };

    // Determine which rankings to calculate
    const shouldCalculateWeekly = body.periodType === 'weekly' || body.forceRecalc || dayOfWeek === 1; // Monday
    const shouldCalculateMonthly = body.periodType === 'monthly' || body.forceRecalc || dayOfMonth === 1;
    const shouldCalculateYearly = body.periodType === 'yearly' || body.forceRecalc || (month === 0 && dayOfMonth === 1);

    // Calculate weekly ranking
    if (shouldCalculateWeekly) {
      const period = calculateWeekPeriod();
      console.log(`[calculate-influence-rankings] Calculating weekly: ${period.start} to ${period.end}`);
      
      const { data, error } = await supabase.rpc('calculate_influence_ranking', {
        p_period_type: 'weekly',
        p_period_start: period.start,
        p_period_end: period.end,
      });

      if (error) {
        console.error('[calculate-influence-rankings] Weekly error:', error);
        throw error;
      }

      results.push({
        periodType: 'weekly',
        periodStart: period.start,
        periodEnd: period.end,
        usersRanked: data || 0,
      });
    }

    // Calculate monthly ranking
    if (shouldCalculateMonthly) {
      const period = calculateMonthPeriod();
      console.log(`[calculate-influence-rankings] Calculating monthly: ${period.start} to ${period.end}`);
      
      const { data, error } = await supabase.rpc('calculate_influence_ranking', {
        p_period_type: 'monthly',
        p_period_start: period.start,
        p_period_end: period.end,
      });

      if (error) {
        console.error('[calculate-influence-rankings] Monthly error:', error);
        throw error;
      }

      results.push({
        periodType: 'monthly',
        periodStart: period.start,
        periodEnd: period.end,
        usersRanked: data || 0,
      });
    }

    // Calculate yearly ranking
    if (shouldCalculateYearly) {
      const period = calculateYearPeriod();
      console.log(`[calculate-influence-rankings] Calculating yearly: ${period.start} to ${period.end}`);
      
      const { data, error } = await supabase.rpc('calculate_influence_ranking', {
        p_period_type: 'yearly',
        p_period_start: period.start,
        p_period_end: period.end,
      });

      if (error) {
        console.error('[calculate-influence-rankings] Yearly error:', error);
        throw error;
      }

      results.push({
        periodType: 'yearly',
        periodStart: period.start,
        periodEnd: period.end,
        usersRanked: data || 0,
      });
    }

    console.log('[calculate-influence-rankings] Completed. Results:', results);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        message: `Ranking calculation completed for ${results.length} period(s)`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[calculate-influence-rankings] Fatal error:', errorMessage);
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
