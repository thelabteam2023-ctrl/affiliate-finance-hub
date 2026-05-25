import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withMiddleware, corsHeaders } from '../_shared/middleware.ts';
import { callExternalApi } from '../_shared/apiWrapper.ts';

const FN_NAME = 'api-monitor';

// Lista completa de todas as ligas que queremos monitorar (The Odds API keys)
const ALL_LEAGUES = [
  // FUTEBOL
  { sport: 'soccer', key: 'soccer_brazil_campeonato',          name: 'Brasileirão Série A',     flag: '🇧🇷' },
  { sport: 'soccer', key: 'soccer_epl',                        name: 'Premier League',           flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { sport: 'soccer', key: 'soccer_germany_bundesliga',         name: 'Bundesliga',               flag: '🇩🇪' },
  { sport: 'soccer', key: 'soccer_spain_la_liga',              name: 'La Liga',                  flag: '🇪🇸' },
  { sport: 'soccer', key: 'soccer_italy_serie_a',              name: 'Serie A',                  flag: '🇮🇹' },
  { sport: 'soccer', key: 'soccer_france_ligue_one',           name: 'Ligue 1',                  flag: '🇫🇷' },
  { sport: 'soccer', key: 'soccer_uefa_champs_league',         name: 'Champions League',         flag: '🏆' },
  { sport: 'soccer', key: 'soccer_uefa_europa_league',         name: 'Europa League',            flag: '🏆' },
  { sport: 'soccer', key: 'soccer_usa_mls',                    name: 'MLS',                      flag: '🇺🇸' },
  { sport: 'soccer', key: 'soccer_argentina_primera_division', name: 'Liga Argentina',           flag: '🇦🇷' },
  { sport: 'soccer', key: 'soccer_saudi_professional_league',  name: 'Saudi Pro League',         flag: '🇸🇦' },
  { sport: 'soccer', key: 'soccer_turkey_super_league',        name: 'Süper Lig',                flag: '🇹🇷' },
  { sport: 'soccer', key: 'soccer_netherlands_eredivisie',     name: 'Eredivisie',               flag: '🇳🇱' },
  { sport: 'soccer', key: 'soccer_portugal_primeira_liga',     name: 'Primeira Liga',            flag: '🇵🇹' },
  { sport: 'soccer', key: 'soccer_mexico_ligamx',              name: 'Liga MX',                  flag: '🇲🇽' },
  // BASQUETE
  { sport: 'basketball', key: 'basketball_nba',                name: 'NBA',                      flag: '🇺🇸' },
  { sport: 'basketball', key: 'basketball_euroleague',         name: 'EuroLeague',               flag: '🇪🇺' },
  // TÊNIS
  { sport: 'tennis', key: 'tennis_atp_french_open',            name: 'ATP French Open',          flag: '🇫🇷' },
  { sport: 'tennis', key: 'tennis_wta_french_open',            name: 'WTA French Open',          flag: '🇫🇷' },
  // HOCKEY
  { sport: 'icehockey', key: 'icehockey_nhl',                  name: 'NHL',                      flag: '🇺🇸' },
];

async function syncDailyEvents(supabase: any, triggeredBy: 'cron' | 'manual' = 'cron') {
  const apiKey = Deno.env.get('ODDS_API_KEY');
  if (!apiKey) throw new Error('ODDS_API_KEY not set');

  let totalSaved = 0;
  let totalCredits = 0;

  for (const league of ALL_LEAGUES) {
    try {
      const endpoint = `https://api.the-odds-api.com/v4/sports/${league.key}/events?apiKey=${apiKey}&dateFormat=iso`;
      
      const result = await callExternalApi({
        apiName: 'odds_api',
        endpoint,
        sportKey: league.key,
        triggeredBy,
        creditsUsed: 1
      });

      totalCredits++;

      if (result.errorMessage || !result.data) {
        console.warn(`[SKIP] ${league.key}: ${result.errorMessage || 'No data'}`);
        continue;
      }

      const events = result.data;

      for (const ev of events) {
        const { error } = await supabase
          .from('daily_events')
          .upsert({
            api_id: ev.id,
            sport: league.sport,
            league_key: league.key,
            league_name: league.name,
            league_flag: league.flag,
            home_team: ev.home_team,
            away_team: ev.away_team,
            commence_time: ev.commence_time,
            event_date: ev.commence_time.split('T')[0],
            synced_at: new Date().toISOString()
          }, { 
            onConflict: 'api_id' 
          });

        if (error) {
          console.error(`Error saving event ${ev.id}:`, error);
        } else {
          totalSaved++;
        }
      }

      // Small pause to avoid hitting rate limits too fast
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.error(`[ERROR] ${league.key}:`, err instanceof Error ? err.message : String(err));
    }
  }

  return { totalSaved, totalCredits };
}

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
      
      try {
        let result;
        if (job === 'fetch_events') {
          result = await syncDailyEvents(supabase, 'manual');
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
