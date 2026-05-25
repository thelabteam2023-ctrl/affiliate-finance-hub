import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withMiddleware, corsHeaders } from '../_shared/middleware.ts';
import { callExternalApi } from '../_shared/apiWrapper.ts';

const FN_NAME = 'api-monitor';

// Lista completa de todas as ligas monitoradas com metadados geográficos e de tipo
const ALL_LEAGUES = [
  // FUTEBOL - AMÉRICA DO SUL
  { sport: 'soccer', key: 'soccer_brazil_campeonato', name: 'Brasileirão Série A', flag: '🇧🇷', continent: 'América do Sul', country: 'Brasil', type: 'league' },
  { sport: 'soccer', key: 'soccer_brazil_serie_b', name: 'Brasileirão Série B', flag: '🇧🇷', continent: 'América do Sul', country: 'Brasil', type: 'league' },
  { sport: 'soccer', key: 'soccer_argentina_primera_division', name: 'Liga Profesional', flag: '🇦🇷', continent: 'América do Sul', country: 'Argentina', type: 'league' },
  { sport: 'soccer', key: 'soccer_chile_campeonato', name: 'Campeonato Nacional', flag: '🇨🇱', continent: 'América do Sul', country: 'Chile', type: 'league' },
  { sport: 'soccer', key: 'soccer_conmebol_copa_libertadores', name: 'Copa Libertadores', flag: '🏆', continent: 'América do Sul', country: 'Continental', type: 'continental' },
  { sport: 'soccer', key: 'soccer_conmebol_copa_sudamericana', name: 'Copa Sudamericana', flag: '🏆', continent: 'América do Sul', country: 'Continental', type: 'continental' },
  
  // FUTEBOL - AMÉRICA DO NORTE / CENTRAL
  { sport: 'soccer', key: 'soccer_usa_mls', name: 'MLS', flag: '🇺🇸', continent: 'América do Norte', country: 'Estados Unidos', type: 'league' },
  { sport: 'soccer', key: 'soccer_mexico_ligamx', name: 'Liga MX', flag: '🇲🇽', continent: 'América do Norte', country: 'México', type: 'league' },
  { sport: 'soccer', key: 'soccer_concacaf_leagues_cup', name: 'Leagues Cup', flag: '🏆', continent: 'América do Norte', country: 'Continental', type: 'continental' },

  // FUTEBOL - EUROPA
  { sport: 'soccer', key: 'soccer_epl', name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', continent: 'Europa', country: 'Inglaterra', type: 'league' },
  { sport: 'soccer', key: 'soccer_efl_champ', name: 'Championship', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', continent: 'Europa', country: 'Inglaterra', type: 'league' },
  { sport: 'soccer', key: 'soccer_fa_cup', name: 'FA Cup', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', continent: 'Europa', country: 'Inglaterra', type: 'cup' },
  { sport: 'soccer', key: 'soccer_england_efl_cup', name: 'EFL Cup', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', continent: 'Europa', country: 'Inglaterra', type: 'cup' },
  { sport: 'soccer', key: 'soccer_spain_la_liga', name: 'La Liga', flag: '🇪🇸', continent: 'Europa', country: 'Espanha', type: 'league' },
  { sport: 'soccer', key: 'soccer_spain_segunda_division', name: 'La Liga 2', flag: '🇪🇸', continent: 'Europa', country: 'Espanha', type: 'league' },
  { sport: 'soccer', key: 'soccer_spain_copa_del_rey', name: 'Copa del Rey', flag: '🇪🇸', continent: 'Europa', country: 'Espanha', type: 'cup' },
  { sport: 'soccer', key: 'soccer_italy_serie_a', name: 'Serie A', flag: '🇮🇹', continent: 'Europa', country: 'Itália', type: 'league' },
  { sport: 'soccer', key: 'soccer_italy_serie_b', name: 'Serie B', flag: '🇮🇹', continent: 'Europa', country: 'Itália', type: 'league' },
  { sport: 'soccer', key: 'soccer_italy_coppa_italia', name: 'Coppa Italia', flag: '🇮🇹', continent: 'Europa', country: 'Itália', type: 'cup' },
  { sport: 'soccer', key: 'soccer_germany_bundesliga', name: 'Bundesliga', flag: '🇩🇪', continent: 'Europa', country: 'Alemanha', type: 'league' },
  { sport: 'soccer', key: 'soccer_germany_bundesliga2', name: '2. Bundesliga', flag: '🇩🇪', continent: 'Europa', country: 'Alemanha', type: 'league' },
  { sport: 'soccer', key: 'soccer_germany_dfb_pokal', name: 'DFB-Pokal', flag: '🇩🇪', continent: 'Europa', country: 'Alemanha', type: 'cup' },
  { sport: 'soccer', key: 'soccer_france_ligue_one', name: 'Ligue 1', flag: '🇫🇷', continent: 'Europa', country: 'França', type: 'league' },
  { sport: 'soccer', key: 'soccer_france_ligue_two', name: 'Ligue 2', flag: '🇫🇷', continent: 'Europa', country: 'França', type: 'league' },
  { sport: 'soccer', key: 'soccer_france_coupe_de_france', name: 'Coupe de France', flag: '🇫🇷', continent: 'Europa', country: 'França', type: 'cup' },
  { sport: 'soccer', key: 'soccer_portugal_primeira_liga', name: 'Primeira Liga', flag: '🇵🇹', continent: 'Europa', country: 'Portugal', type: 'league' },
  { sport: 'soccer', key: 'soccer_netherlands_eredivisie', name: 'Eredivisie', flag: '🇳🇱', continent: 'Europa', country: 'Holanda', type: 'league' },
  { sport: 'soccer', key: 'soccer_belgium_first_div', name: 'Pro League', flag: '🇧🇪', continent: 'Europa', country: 'Bélgica', type: 'league' },
  { sport: 'soccer', key: 'soccer_turkey_super_league', name: 'Süper Lig', flag: '🇹🇷', continent: 'Europa', country: 'Turquia', type: 'league' },
  { sport: 'soccer', key: 'soccer_uefa_champs_league', name: 'Champions League', flag: '🏆', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'soccer', key: 'soccer_uefa_europa_league', name: 'Europa League', flag: '🏆', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'soccer', key: 'soccer_uefa_europa_conference_league', name: 'Conference League', flag: '🏆', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'soccer', key: 'soccer_uefa_euro_cup', name: 'Eurocopa', flag: '🇪🇺', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'soccer', key: 'soccer_conmebol_copa_america', name: 'Copa América', flag: '🏆', continent: 'América do Sul', country: 'Continental', type: 'continental' },
  { sport: 'soccer', key: 'soccer_fifa_world_cup', name: 'Copa do Mundo', flag: '🌎', continent: 'Mundo', country: 'Internacional', type: 'cup' },
  { sport: 'soccer', key: 'soccer_fifa_world_cup_qualifiers_south_america', name: 'Eliminatórias Copa (Am. Sul)', flag: '🌎', continent: 'América do Sul', country: 'Continental', type: 'continental' },
  { sport: 'soccer', key: 'soccer_fifa_world_cup_qualifiers_europe', name: 'Eliminatórias Copa (Europa)', flag: '🌎', continent: 'Europa', country: 'Continental', type: 'continental' },

  // FUTEBOL - ORIENTE MÉDIO / ÁSIA
  { sport: 'soccer', key: 'soccer_saudi_arabia_pro_league', name: 'Saudi Pro League', flag: '🇸🇦', continent: 'Oriente Médio', country: 'Arábia Saudita', type: 'league' },
  { sport: 'soccer', key: 'soccer_japan_j_league', name: 'J1 League', flag: '🇯🇵', continent: 'Ásia', country: 'Japão', type: 'league' },
  { sport: 'soccer', key: 'soccer_china_superleague', name: 'Chinese Super League', flag: '🇨🇳', continent: 'Ásia', country: 'China', type: 'league' },
  { sport: 'soccer', key: 'soccer_korea_kleague1', name: 'K League 1', flag: '🇰🇷', continent: 'Ásia', country: 'Coreia do Sul', type: 'league' },

  // BASQUETE
  { sport: 'basketball', key: 'basketball_nba', name: 'NBA', flag: '🇺🇸', continent: 'América do Norte', country: 'Estados Unidos', type: 'league' },
  { sport: 'basketball', key: 'basketball_euroleague', name: 'EuroLeague', flag: '🇪🇺', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'basketball', key: 'basketball_eurocup', name: 'EuroCup', flag: '🇪🇺', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'basketball', key: 'basketball_champions_league', name: 'Champions League', flag: '🇪🇺', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'basketball', key: 'basketball_spain_liga_acb', name: 'Liga ACB', flag: '🇪🇸', continent: 'Europa', country: 'Espanha', type: 'league' },
  { sport: 'basketball', key: 'basketball_turkey_bsl', name: 'Süper Ligi', flag: '🇹🇷', continent: 'Europa', country: 'Turquia', type: 'league' },
  { sport: 'basketball', key: 'basketball_italy_lega_a', name: 'Lega Basket Serie A', flag: '🇮🇹', continent: 'Europa', country: 'Itália', type: 'league' },
  { sport: 'basketball', key: 'basketball_france_lnb', name: 'LNB Pro A', flag: '🇫🇷', continent: 'Europa', country: 'França', type: 'league' },
  { sport: 'basketball', key: 'basketball_germany_bbl', name: 'Basketball Bundesliga', flag: '🇩🇪', continent: 'Europa', country: 'Alemanha', type: 'league' },
  { sport: 'basketball', key: 'basketball_greece_heba', name: 'Greek Basket League', flag: '🇬🇷', continent: 'Europa', country: 'Grécia', type: 'league' },
  { sport: 'basketball', key: 'basketball_china_cba', name: 'CBA', flag: '🇨🇳', continent: 'Ásia', country: 'China', type: 'league' },
  { sport: 'basketball', key: 'basketball_japan_bleague', name: 'B.League', flag: '🇯🇵', continent: 'Ásia', country: 'Japão', type: 'league' },
  { sport: 'basketball', key: 'basketball_philippines_pba', name: 'PBA', flag: '🇵🇭', continent: 'Ásia', country: 'Filipinas', type: 'league' },
  { sport: 'basketball', key: 'basketball_brazil_nbb', name: 'NBB', flag: '🇧🇷', continent: 'América do Sul', country: 'Brasil', type: 'league' },
  { sport: 'basketball', key: 'basketball_argentina_lnb', name: 'Liga Nacional', flag: '🇦🇷', continent: 'América do Sul', country: 'Argentina', type: 'league' },
  { sport: 'basketball', key: 'basketball_fiba_world_cup', name: 'FIBA World Cup', flag: '🌎', continent: 'Mundo', country: 'Internacional', type: 'cup' },
  { sport: 'basketball', key: 'basketball_olympics', name: 'Olympics', flag: '🏅', continent: 'Mundo', country: 'Internacional', type: 'cup' },

  // BEISEBOL
  { sport: 'baseball', key: 'baseball_mlb', name: 'MLB', flag: '🇺🇸', continent: 'América do Norte', country: 'Estados Unidos', type: 'league' },
  { sport: 'baseball', key: 'baseball_npb', name: 'NPB', flag: '🇯🇵', continent: 'Ásia', country: 'Japão', type: 'league' },
  { sport: 'baseball', key: 'baseball_kbo', name: 'KBO League', flag: '🇰🇷', continent: 'Ásia', country: 'Coreia do Sul', type: 'league' },
  { sport: 'baseball', key: 'baseball_mexico_lmb', name: 'Liga Mexicana de Beisbol', flag: '🇲🇽', continent: 'América do Norte', country: 'México', type: 'league' },
  { sport: 'baseball', key: 'baseball_wbc', name: 'World Baseball Classic', flag: '🌎', continent: 'Mundo', country: 'Internacional', type: 'cup' },

  // FUTEBOL AMERICANO
  { sport: 'americanfootball', key: 'americanfootball_nfl', name: 'NFL', flag: '🇺🇸', continent: 'América do Norte', country: 'Estados Unidos', type: 'league' },
  { sport: 'americanfootball', key: 'americanfootball_cfl', name: 'CFL', flag: '🇨🇦', continent: 'América do Norte', country: 'Canadá', type: 'league' },
  { sport: 'americanfootball', key: 'americanfootball_elf', name: 'European League of Football', flag: '🇪🇺', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'americanfootball', key: 'americanfootball_lfa', name: 'Liga de Fútbol Americano', flag: '🇲🇽', continent: 'América do Norte', country: 'México', type: 'league' },
  { sport: 'americanfootball', key: 'americanfootball_ncaaf', name: 'NCAA Division I', flag: '🇺🇸', continent: 'América do Norte', country: 'Estados Unidos', type: 'league' },

  // TÊNIS (EXEMPLOS)
  { sport: 'soccer', key: 'tennis_atp_french_open', name: 'ATP French Open', flag: '🇫🇷', continent: 'Europa', country: 'França', type: 'cup' },
  { sport: 'soccer', key: 'tennis_wta_french_open', name: 'WTA French Open', flag: '🇫🇷', continent: 'Europa', country: 'França', type: 'cup' },

  // HÓQUEI
  { sport: 'icehockey', key: 'icehockey_nhl', name: 'NHL', flag: '🇺🇸', continent: 'América do Norte', country: 'Estados Unidos', type: 'league' },
  { sport: 'icehockey', key: 'icehockey_khl', name: 'KHL', flag: '🇷🇺', continent: 'Europa', country: 'Rússia', type: 'league' },
  { sport: 'icehockey', key: 'icehockey_sweden_allsvenskan', name: 'Swedish Hockey League', flag: '🇸🇪', continent: 'Europa', country: 'Suécia', type: 'league' },
  { sport: 'icehockey', key: 'icehockey_finland_liiga', name: 'Liiga', flag: '🇫🇮', continent: 'Europa', country: 'Finlândia', type: 'league' },
  { sport: 'icehockey', key: 'icehockey_switzerland_national_league', name: 'National League', flag: '🇨🇭', continent: 'Europa', country: 'Suíça', type: 'league' },
  { sport: 'icehockey', key: 'icehockey_germany_del', name: 'DEL', flag: '🇩🇪', continent: 'Europa', country: 'Alemanha', type: 'league' },
  { sport: 'icehockey', key: 'icehockey_czech_extraliga', name: 'Czech Extraliga', flag: '🇨🇿', continent: 'Europa', country: 'República Tcheca', type: 'league' },
  { sport: 'icehockey', key: 'icehockey_champions_hockey_league', name: 'Champions Hockey League', flag: '🇪🇺', continent: 'Europa', country: 'Continental', type: 'continental' },
];

async function syncMonitoredLeagues(supabase: any) {
  console.log(`Syncing ${ALL_LEAGUES.length} leagues to monitored_leagues table...`);
  
  for (const league of ALL_LEAGUES) {
    const { error } = await supabase
      .from('monitored_leagues')
      .upsert({
        sport: league.sport,
        league_key: league.key,
        league_name: league.name,
        league_flag: league.flag,
        continent: league.continent,
        country: league.country,
        competition_type: league.type,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'league_key' });
      
    if (error) console.error(`Error syncing league ${league.key}:`, error);
  }
}

async function syncDailyEvents(supabase: any, triggeredBy: 'cron' | 'manual' = 'cron') {
  const apiKey = Deno.env.get('ODDS_API_KEY');
  if (!apiKey) throw new Error('ODDS_API_KEY not set');

  // Primeiro sincroniza a lista de ligas
  await syncMonitoredLeagues(supabase);

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
            continent: league.continent,
            country: league.country,
            competition_type: league.type,
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

      await new Promise(r => setTimeout(r, 100));

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

    if (request.method === 'POST' && path === 'run-job') {
      const { job } = await request.json();
      try {
        let result;
        if (job === 'fetch_events') {
          result = await syncDailyEvents(supabase, 'manual');
        } else if (job === 'sync_leagues') {
          await syncMonitoredLeagues(supabase);
          result = { success: true };
        } else {
          return new Response(JSON.stringify({ error: 'Job desconhecido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: true, result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ error: 'Rota não encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  });
});