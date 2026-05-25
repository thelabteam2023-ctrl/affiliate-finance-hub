import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withMiddleware, corsHeaders } from '../_shared/middleware.ts';
import { callExternalApi } from '../_shared/apiWrapper.ts';


const FN_NAME = 'api-monitor';

const API_SPORTS_ENDPOINTS: Record<string, string> = {
  soccer:           'https://v3.football.api-sports.io',
  basketball:       'https://v3.basketball.api-sports.io',
  icehockey:        'https://v3.hockey.api-sports.io',
  baseball:         'https://v3.baseball.api-sports.io',
  americanfootball: 'https://v3.american-football.api-sports.io',
  tennis:           'https://v3.tennis.api-sports.io',
};

const LEAGUE_LOGO_BASE_URLS: Record<string, string> = {
  soccer:           'https://media.api-sports.io/football/leagues',
  basketball:       'https://media.api-sports.io/basketball/leagues',
  icehockey:        'https://media.api-sports.io/hockey/leagues',
  baseball:         'https://media.api-sports.io/baseball/leagues',
  americanfootball: 'https://media.api-sports.io/american-football/leagues',
};

const LEAGUE_ID_MAP: Record<string, { sport: string, id: number }> = {
  // FUTEBOL
  'soccer_epl':                        { sport: 'soccer', id: 39  },
  'soccer_germany_bundesliga':         { sport: 'soccer', id: 78  },
  'soccer_spain_la_liga':              { sport: 'soccer', id: 140 },
  'soccer_italy_serie_a':              { sport: 'soccer', id: 135 },
  'soccer_france_ligue_one':           { sport: 'soccer', id: 61  },
  'soccer_brazil_campeonato':          { sport: 'soccer', id: 71  },
  'soccer_brazil_serie_b':             { sport: 'soccer', id: 72  },
  'soccer_uefa_champs_league':         { sport: 'soccer', id: 2   },
  'soccer_uefa_europa_league':         { sport: 'soccer', id: 3   },
  'soccer_usa_mls':                    { sport: 'soccer', id: 253 },
  'soccer_argentina_primera_division': { sport: 'soccer', id: 128 },
  'soccer_saudi_professional_league':  { sport: 'soccer', id: 307 },
  'soccer_turkey_super_league':        { sport: 'soccer', id: 203 },
  'soccer_netherlands_eredivisie':     { sport: 'soccer', id: 88  },
  'soccer_portugal_primeira_liga':     { sport: 'soccer', id: 94  },
  'soccer_mexico_ligamx':              { sport: 'soccer', id: 262 },

  // BASQUETE
  'basketball_nba':                    { sport: 'basketball', id: 12  },
  'basketball_euroleague':             { sport: 'basketball', id: 120 },
  'basketball_wnba':                   { sport: 'basketball', id: 13  },

  // HOCKEY
  'icehockey_nhl':                     { sport: 'icehockey', id: 57 },

  // FUTEBOL AMERICANO
  'americanfootball_nfl':              { sport: 'americanfootball', id: 1 },

  // BEISEBOL
  'baseball_mlb':                      { sport: 'baseball', id: 1 },
};

// Lista completa de todas as ligas monitoradas com metadados geográficos e de tipo
const ALL_LEAGUES = [
...
  { sport: 'soccer_fifa', key: 'soccer_fifa_cyber_live_arena', name: 'Cyber Live Arena', flag: '🎮', continent: 'Mundo', country: 'Simulado', type: 'league' },
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
            home_team_logo: ev.home_team_logo || null,
            away_team_logo: ev.away_team_logo || null,
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

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/\s+/g, ' ')             // normaliza espaços
    .trim();
}

async function getTeamLogo(supabase: any, teamName: string, sport: string) {
  const normalized = normalizeName(teamName);
  const apiKey = Deno.env.get('API_FOOTBALL_KEY');

  // 1. Verifica cache no banco
  const { data: cached } = await supabase
    .from('team_logos')
    .select('logo_url, found')
    .eq('sport', sport)
    .eq('team_name_normalized', normalized)
    .maybeSingle();

  if (cached) {
    return cached.found ? cached.logo_url : null;
  }

  if (!apiKey) return null;

  // 2. Busca na API-Football
  const baseUrl = API_SPORTS_ENDPOINTS[sport] || API_SPORTS_ENDPOINTS.soccer;

  try {
    const res = await fetch(
      `${baseUrl}/teams?search=${encodeURIComponent(teamName)}`,
      { headers: { 'x-apisports-key': apiKey } }
    );

    const data = await res.json();
    const team = data.response?.[0]?.team;

    const logoUrl = team?.logo || null;
    const apiId   = team?.id   || null;
    const found   = !!logoUrl;

    // 3. Salva no cache
    await supabase.from('team_logos').upsert({
      sport,
      team_name_normalized: normalized,
      team_name_original: teamName,
      api_sports_id: apiId,
      logo_url: logoUrl,
      found,
      searched_at: new Date().toISOString()
    }, { onConflict: 'sport,team_name_normalized' });

    return logoUrl;

  } catch (err) {
    console.error(`Erro ao buscar logo de ${teamName}:`, err);
    return null;
  }
}

async function getLeagueLogo(supabase: any, leagueKey: string, sport: string) {
  // 1. Verifica cache
  const { data: cached } = await supabase
    .from('league_logos')
    .select('logo_url, found')
    .eq('sport', sport)
    .eq('league_key', leagueKey)
    .maybeSingle();

  if (cached) {
    return cached.found ? cached.logo_url : null;
  }

  // 2. Busca pelo ID mapeado
  const mapping = LEAGUE_ID_MAP[leagueKey];
  if (!mapping) return null;

  const logoUrl = `${LEAGUE_LOGO_BASE_URLS[mapping.sport]}/${mapping.id}.png`;

  // 3. Salva no cache
  await supabase.from('league_logos').upsert({
    sport,
    league_key: leagueKey,
    league_name: null, 
    api_sports_id: mapping.id,
    logo_url: logoUrl,
    found: true,
    searched_at: new Date().toISOString()
  }, { onConflict: 'sport,league_key' });

  return logoUrl;
}

async function syncLogosForToday(supabase: any) {
  console.log('Starting logo synchronization pass...');
  const today = new Date().toISOString().split('T')[0];

  const { data: events, error } = await supabase
    .from('daily_events')
    .select('home_team, away_team, sport, league_key')
    .eq('event_date', today);

  if (error || !events) return { apiCallsUsed: 0 };

  // Filtrar eventos que faltam pelo menos uma logo
  const pendingEvents = events.filter((ev: any) => !ev.home_team_logo || !ev.away_team_logo || !ev.league_logo);

  if (pendingEvents.length === 0) {
    console.log('All events already have logos cached.');
    return { apiCallsUsed: 0 };
  }

  // Remover duplicados para otimizar chamadas
  const uniqueTeams = new Map<string, { name: string, sport: string }>();
  const uniqueLeagues = new Set<string>();

  pendingEvents.forEach((ev: any) => {
    uniqueTeams.set(`${ev.sport}|${ev.home_team}`, { name: ev.home_team, sport: ev.sport });
    uniqueTeams.set(`${ev.sport}|${ev.away_team}`, { name: ev.away_team, sport: ev.sport });
    uniqueLeagues.add(`${ev.sport}|${ev.league_key}`);
  });

  let apiCallsUsed = 0;
  const MAX_CALLS_PER_RUN = 80;

  // 1. Sync leagues first (free)
  for (const item of uniqueLeagues) {
    const [sport, league_key] = item.split('|');
    await getLeagueLogo(supabase, league_key, sport);
  }

  // 2. Sync teams
  for (const [key, team] of uniqueTeams.entries()) {
    if (apiCallsUsed >= MAX_CALLS_PER_RUN) break;

    // Verificar se já está em cache antes de contar chamada
    const normalized = normalizeName(team.name);
    const { data: cached } = await supabase
      .from('team_logos')
      .select('id')
      .eq('sport', team.sport)
      .eq('team_name_normalized', normalized)
      .maybeSingle();

    if (!cached) {
      await getTeamLogo(supabase, team.name, team.sport);
      apiCallsUsed++;
      // Sleep para evitar rate limit da API
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // 3. Update events with findings from cache
  for (const ev of events) {
    const homeLogo = await getTeamLogo(supabase, ev.home_team, ev.sport);
    const awayLogo = await getTeamLogo(supabase, ev.away_team, ev.sport);
    const leagueLogo = await getLeagueLogo(supabase, ev.league_key, ev.sport);

    await supabase
      .from('daily_events')
      .update({
        home_team_logo: homeLogo,
        away_team_logo: awayLogo,
        league_logo: leagueLogo
      })
      .eq('home_team', ev.home_team)
      .eq('away_team', ev.away_team)
      .eq('event_date', today);
  }

  console.log(`Logo sync finished. API calls used: ${apiCallsUsed}`);
  return { apiCallsUsed };
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
        if (job === 'fetch_events') {
          // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
          EdgeRuntime.waitUntil(
            syncDailyEvents(supabase, 'manual').catch((err) =>
              console.error('[BG] syncDailyEvents failed:', err)
            )
          );
          return new Response(
            JSON.stringify({ success: true, result: { queued: true, message: 'Sincronização iniciada em background. Os dados aparecerão em alguns minutos.', totalSaved: 0 } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else if (job === 'sync_leagues') {
          await syncMonitoredLeagues(supabase);
          return new Response(JSON.stringify({ success: true, result: { success: true } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
          return new Response(JSON.stringify({ error: 'Job desconhecido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ error: 'Rota não encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  });
});