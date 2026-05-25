import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withMiddleware, corsHeaders } from '../_shared/middleware.ts';
import { callExternalApi } from '../_shared/apiWrapper.ts';

const FN_NAME = 'api-monitor';

Deno.serve(async (req) => {
  return await withMiddleware(req, FN_NAME, async (auth, request) => {
    const url = new URL(request.url);
    const path = url.pathname.split('/').pop();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Security: Only system owners can access this function
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_system_owner')
      .eq('id', auth.userId)
      .single();

    if (!profile?.is_system_owner) {
      return new Response(
        JSON.stringify({ error: 'Acesso restrito ao proprietário do sistema.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /summary ---
    if (request.method === 'GET' && path === 'summary') {
      const today = new Date().toISOString().split('T')[0];
      const month = today.slice(0, 7);

      const [dayStats, monthStats, lastCall] = await Promise.all([
        supabase
          .from('api_usage_summary')
          .select('api_name, total_calls, total_credits, total_errors')
          .eq('period_type', 'day')
          .eq('period_key', today),
        
        supabase
          .from('api_usage_summary')
          .select('api_name, total_calls, total_credits, total_errors')
          .eq('period_type', 'month')
          .eq('period_key', month),

        supabase
          .from('api_request_logs')
          .select('api_name, created_at, status_code, duration_ms')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
      ]);

      return new Response(
        JSON.stringify({
          today: dayStats.data || [],
          month: monthStats.data || [],
          lastCall: lastCall.data || null,
          limits: {
            odds_api: { daily: null, monthly: 500 },
            api_football: { daily: 100, monthly: null }
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /logs ---
    if (request.method === 'GET' && path === 'logs') {
      const api = url.searchParams.get('api');
      const status = url.searchParams.get('status');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const page = parseInt(url.searchParams.get('page') || '1');
      const offset = (page - 1) * limit;

      let query = supabase
        .from('api_request_logs')
        .select('*', { count: 'exact' });

      if (api) query = query.eq('api_name', api);
      if (status === 'error') query = query.not('error_message', 'is', null);
      if (status === 'ok') query = query.is('error_message', null);

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return new Response(
        JSON.stringify({ logs: data, count, page, limit }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /preview ---
    if (request.method === 'GET' && path === 'preview') {
      const api = url.searchParams.get('api') as 'odds_api' | 'api_football' || 'odds_api';
      const sport = url.searchParams.get('sport') || 'soccer_epl';

      let endpoint = '';
      if (api === 'odds_api') {
        const apiKey = Deno.env.get('ODDS_API_KEY');
        endpoint = `https://api.the-odds-api.com/v4/sports/${sport}/events?apiKey=${apiKey}&dateFormat=iso`;
      } else {
        const today = new Date().toISOString().split('T')[0];
        endpoint = `https://v3.football.api-sports.io/fixtures?date=${today}`;
      }

      const result = await callExternalApi({
        apiName: api,
        endpoint,
        sportKey: sport,
        triggeredBy: 'manual',
        creditsUsed: 1
      });

      return new Response(
        JSON.stringify({
          url: endpoint.replace(Deno.env.get('ODDS_API_KEY') || '', 'HIDDEN_KEY'),
          statusCode: result.statusCode,
          durationMs: result.durationMs,
          recordsReturned: result.recordsReturned,
          errorMessage: result.errorMessage,
          rawData: result.data
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /run-job ---
    if (request.method === 'POST' && path === 'run-job') {
      const { job } = await request.json();
      
      // Placeholder for actual job functions. 
      // In a real scenario, these would be imported from elsewhere or implemented here.
      let result;
      try {
        if (job === 'fetch_events') {
          // result = await fetchDailyEvents('manual');
          result = { success: true, message: 'Job fetch_events disparado (simulado)' };
        } else if (job === 'fetch_scores') {
          // result = await fetchDailyScores('manual');
          result = { success: true, message: 'Job fetch_scores disparado (simulado)' };
        } else if (job === 'fetch_sports_directory') {
          // result = await fetchSportsDirectory('manual');
          result = { success: true, message: 'Job fetch_sports_directory disparado (simulado)' };
        } else {
          return new Response(
            JSON.stringify({ error: 'Job desconhecido' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Rota não encontrada' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  });
});
