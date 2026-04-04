import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withMiddleware, corsHeaders, type AuthResult } from '../_shared/middleware.ts';

interface RankingResult {
  periodType: string;
  periodStart: string;
  periodEnd: string;
  usersRanked: number;
}

Deno.serve(async (req) => {
  return withMiddleware(req, 'calculate-influence-rankings', async (auth, req) => {
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
    const dayOfWeek = today.getDay();
    const dayOfMonth = today.getDate();
    const month = today.getMonth();

    const formatDate = (d: Date): string => d.toISOString().split('T')[0];

    const calculateWeekPeriod = () => {
      const lastSunday = new Date(today);
      lastSunday.setDate(today.getDate() - dayOfWeek);
      const lastMonday = new Date(lastSunday);
      lastMonday.setDate(lastSunday.getDate() - 6);
      return { start: formatDate(lastMonday), end: formatDate(lastSunday) };
    };

    const calculateMonthPeriod = () => {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: formatDate(firstDay), end: formatDate(lastDay) };
    };

    const calculateYearPeriod = () => {
      const firstDay = new Date(today.getFullYear() - 1, 0, 1);
      const lastDay = new Date(today.getFullYear() - 1, 11, 31);
      return { start: formatDate(firstDay), end: formatDate(lastDay) };
    };

    const shouldCalculateWeekly = body.periodType === 'weekly' || body.forceRecalc || dayOfWeek === 1;
    const shouldCalculateMonthly = body.periodType === 'monthly' || body.forceRecalc || dayOfMonth === 1;
    const shouldCalculateYearly = body.periodType === 'yearly' || body.forceRecalc || (month === 0 && dayOfMonth === 1);

    if (shouldCalculateWeekly) {
      const period = calculateWeekPeriod();
      console.log(`[calculate-influence-rankings] Calculating weekly: ${period.start} to ${period.end}`);
      const { data, error } = await supabase.rpc('calculate_influence_ranking', {
        p_period_type: 'weekly', p_period_start: period.start, p_period_end: period.end,
      });
      if (error) { console.error('[calculate-influence-rankings] Weekly error:', error); throw error; }
      results.push({ periodType: 'weekly', periodStart: period.start, periodEnd: period.end, usersRanked: data || 0 });
    }

    if (shouldCalculateMonthly) {
      const period = calculateMonthPeriod();
      console.log(`[calculate-influence-rankings] Calculating monthly: ${period.start} to ${period.end}`);
      const { data, error } = await supabase.rpc('calculate_influence_ranking', {
        p_period_type: 'monthly', p_period_start: period.start, p_period_end: period.end,
      });
      if (error) { console.error('[calculate-influence-rankings] Monthly error:', error); throw error; }
      results.push({ periodType: 'monthly', periodStart: period.start, periodEnd: period.end, usersRanked: data || 0 });
    }

    if (shouldCalculateYearly) {
      const period = calculateYearPeriod();
      console.log(`[calculate-influence-rankings] Calculating yearly: ${period.start} to ${period.end}`);
      const { data, error } = await supabase.rpc('calculate_influence_ranking', {
        p_period_type: 'yearly', p_period_start: period.start, p_period_end: period.end,
      });
      if (error) { console.error('[calculate-influence-rankings] Yearly error:', error); throw error; }
      results.push({ periodType: 'yearly', periodStart: period.start, periodEnd: period.end, usersRanked: data || 0 });
    }

    console.log('[calculate-influence-rankings] Completed. Results:', results);

    return new Response(
      JSON.stringify({
        success: true, results,
        message: `Ranking calculation completed for ${results.length} period(s)`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }, { allowCron: true, skipRateLimitForCron: true });
});
