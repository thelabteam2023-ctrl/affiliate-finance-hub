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

/**
 * Normaliza nomes de times para comparação resiliente (remove acentos, espaços extras, etc)
 */
function normalizeTeamName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9]/g, "")      // Remove caracteres especiais
    .trim();
}

// Lista de ligas para o Odds API (configuração estática básica)
const ALL_LEAGUES = [
  { sport: 'soccer', key: 'soccer_brazil_campeonato', name: 'Brasileirão Série A', flag: '🇧🇷', continent: 'América do Sul', country: 'Brasil', type: 'league' },
  { sport: 'soccer', key: 'soccer_brazil_serie_b', name: 'Série B', flag: '🇧🇷', continent: 'América do Sul', country: 'Brasil', type: 'league' },
  { sport: 'soccer', key: 'soccer_epl', name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', continent: 'Europa', country: 'Inglaterra', type: 'league' },
  { sport: 'soccer', key: 'soccer_germany_bundesliga', name: 'Bundesliga', flag: '🇩🇪', continent: 'Europa', country: 'Alemanha', type: 'league' },
  { sport: 'soccer', key: 'soccer_spain_la_liga', name: 'La Liga', flag: '🇪🇸', continent: 'Europa', country: 'Espanha', type: 'league' },
  { sport: 'soccer', key: 'soccer_italy_serie_a', name: 'Serie A', flag: '🇮🇹', continent: 'Europa', country: 'Itália', type: 'league' },
  { sport: 'soccer', key: 'soccer_france_ligue_one', name: 'Ligue 1', flag: '🇫🇷', continent: 'Europa', country: 'França', type: 'league' },
  { sport: 'soccer', key: 'soccer_uefa_champs_league', name: 'Champions League', flag: '🏆', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'soccer', key: 'soccer_conmebol_copa_libertadores', name: 'Libertadores', flag: '🏆', continent: 'América do Sul', country: 'Continental', type: 'continental' },
  { sport: 'soccer', key: 'soccer_conmebol_copa_sudamericana', name: 'Sudamericana', flag: '🏆', continent: 'América do Sul', country: 'Continental', type: 'continental' },
  { sport: 'basketball', key: 'basketball_nba', name: 'NBA', flag: '🇺🇸', continent: 'América do Norte', country: 'EUA', type: 'league' },
  { sport: 'baseball', key: 'baseball_mlb', name: 'MLB', flag: '🇺🇸', continent: 'América do Norte', country: 'EUA', type: 'league' },
  { sport: 'americanfootball', key: 'americanfootball_nfl', name: 'NFL', flag: '🇺🇸', continent: 'América do Norte', country: 'EUA', type: 'league' },
  { sport: 'icehockey', key: 'icehockey_nhl', name: 'NHL', flag: '🇺🇸', continent: 'América do Norte', country: 'EUA', type: 'league' },
];

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunked: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

/**
 * Lookup de escudo via cache indexado por (league_key, nome_normalizado).
 * Sem fallbacks de busca por nome — evita colisões cross-liga (ex: Botafogo vs Lens).
 */
async function lookupTeamLogo(supabase: any, teamName: string, leagueKey: string): Promise<string | null> {
  const normalized = normalizeTeamName(teamName);
  const { data } = await supabase
    .from('team_logos')
    .select('logo_url, found')
    .eq('league_key', leagueKey)
    .eq('team_name_normalized', normalized)
    .maybeSingle();
  if (data?.found) return data.logo_url;
  return null;
}

/**
 * Sincroniza TODOS os times de uma liga específica, indexados por league_key.
 * Custo: 1 crédito api-sports por liga. Idempotente.
 */
async function syncLeagueTeamsBulk(
  supabase: any,
  sport: string,
  leagueKey: string,
  leagueId: number,
  season: number,
  country?: string,
) {
  const apiEndpoint = API_SPORTS_ENDPOINTS[sport] || API_SPORTS_ENDPOINTS.soccer;
  const url = `${apiEndpoint}/teams?league=${leagueId}&season=${season}`;
  console.log(`[BULK SYNC] ${leagueKey} (league=${leagueId}, season=${season}, sport=${sport})`);

  try {
    const result = await callExternalApi({
      apiName: 'api_football',
      endpoint: url,
      sportKey: sport,
      creditsUsed: 1,
      triggeredBy: 'manual'
    });

    if (!result.data?.response?.length) {
      console.warn(`[BULK SYNC] ${leagueKey}: vazio`);
      return 0;
    }

    let saved = 0;
    for (const item of result.data.response) {
      const team = item.team || item;
      if (!team?.name) continue;
      const normalized = normalizeTeamName(team.name);
      const { error } = await supabase.from('team_logos').upsert({
        sport,
        league_key: leagueKey,
        team_name_normalized: normalized,
        team_name_original: team.name,
        api_sports_id: team.id,
        logo_url: team.logo,
        found: !!team.logo,
        country: country || null,
        searched_at: new Date().toISOString()
      }, { onConflict: 'league_key,team_name_normalized' });
      if (!error) saved++;
      else console.error(`[BULK SYNC] upsert error ${team.name}:`, error.message);
    }
    console.log(`[BULK SYNC] ${leagueKey}: ${saved} times salvos`);
    return saved;
  } catch (err) {
    console.error(`[BULK SYNC] erro ${leagueKey}:`, err);
    return 0;
  }
}

/**
 * Sincroniza times de TODAS as ligas monitoradas com api_sports_id configurado.
 * Roda em lotes de 5 ligas em paralelo. Custo: 1 crédito por liga (~30 créditos total).
 */
async function syncAllTeams(supabase: any) {
  const { data: leagues } = await supabase
    .from('monitored_leagues')
    .select('league_key, sport, api_sports_id, current_season, country')
    .not('api_sports_id', 'is', null);

  if (!leagues?.length) return { syncedLeagues: 0, totalTeams: 0 };

  let totalTeams = 0;
  const chunks = chunkArray(leagues, 5);
  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map((lg: any) =>
      syncLeagueTeamsBulk(supabase, lg.sport, lg.league_key, lg.api_sports_id, lg.current_season || 2024, lg.country)
    ));
    totalTeams += results.reduce((a, b) => a + b, 0);
  }
  return { syncedLeagues: leagues.length, totalTeams };
}

async function getLeagueLogo(supabase: any, leagueKey: string, sport: string) {
  const { data: cached } = await supabase
    .from('league_logos')
    .select('logo_url, found')
    .eq('sport', sport)
    .eq('league_key', leagueKey)
    .maybeSingle();

  if (cached) return cached.found ? cached.logo_url : null;

  // Busca o ID da liga no banco
  const { data: monitored } = await supabase
    .from('monitored_leagues')
    .select('api_sports_id')
    .eq('league_key', leagueKey)
    .maybeSingle();

  if (!monitored?.api_sports_id) return null;

  const logoUrl = `${LEAGUE_LOGO_BASE_URLS[sport] || LEAGUE_LOGO_BASE_URLS.soccer}/${monitored.api_sports_id}.png`;

  await supabase.from('league_logos').upsert({
    sport,
    league_key: leagueKey,
    api_sports_id: monitored.api_sports_id,
    logo_url: logoUrl,
    found: true,
    searched_at: new Date().toISOString()
  }, { onConflict: 'sport,league_key' });

  return logoUrl;
}

async function fetchLeagueEvents(supabase: any, league: any, apiKey: string, triggeredBy: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const endpoint = `https://api.the-odds-api.com/v4/sports/${league.key}/events?apiKey=${apiKey}&dateFormat=iso`;
    const result = await callExternalApi({
      apiName: 'odds_api',
      endpoint,
      sportKey: league.key,
      triggeredBy: triggeredBy as any,
      creditsUsed: 1
    });

    if (result.errorMessage || !result.data) {
      console.warn(`[SKIP] ${league.key}: ${result.errorMessage || 'No data'}`);
      return 0;
    }

    const events = result.data;
    let savedCount = 0;

    const leagueLogo = await getLeagueLogo(supabase, league.key, league.sport);

    // Coletar nomes para buscar escudos
    const uniqueTeams = new Set<string>();
    for (const ev of events) {
      uniqueTeams.add(ev.home_team);
      uniqueTeams.add(ev.away_team);
    }

    const teamLogoMap: Record<string, string | null> = {};
    await Promise.all(Array.from(uniqueTeams).map(async (teamName) => {
      teamLogoMap[teamName] = await getOrSearchTeamLogo(supabase, teamName, league.sport, triggeredBy, league.country);
    }));

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
          home_team_logo: teamLogoMap[ev.home_team],
          away_team_logo: teamLogoMap[ev.away_team],
          league_logo: leagueLogo,
          commence_time: ev.commence_time,
          event_date: ev.commence_time.split('T')[0],
          synced_at: new Date().toISOString()
        }, { onConflict: 'api_id' });

      if (!error) savedCount++;
    }
    return savedCount;
  } catch (err) {
    console.error(`[ERROR] ${league.key}:`, err);
    return 0;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function syncDailyEvents(supabase: any, triggeredBy: 'cron' | 'manual' = 'cron') {
  const apiKey = Deno.env.get('ODDS_API_KEY');
  if (!apiKey) throw new Error('ODDS_API_KEY not set');

  // Atualiza as ligas no banco antes de buscar eventos
  for (const league of ALL_LEAGUES) {
    await supabase.from('monitored_leagues').upsert({
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
  }

  // Busca eventos para as ligas monitoradas
  let totalSaved = 0;
  const chunks = chunkArray(ALL_LEAGUES, 5);

  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(league => fetchLeagueEvents(supabase, league, apiKey, triggeredBy)));
    totalSaved += results.reduce((a, b) => a + b, 0);
  }

  return { totalSaved };
}

async function syncLogosForToday(supabase: any, triggeredBy: string = 'manual') {
  const today = new Date().toISOString().split('T')[0];
  const { data: events } = await supabase
    .from('daily_events')
    .select('home_team, away_team, sport, league_key, country')
    .eq('event_date', today);

  if (!events) return { updated: 0 };

  // Identifica quais ligas estão ativas hoje e faz bulk sync se necessário
  const activeLeagues = new Set(events.map(e => e.league_key));
  const { data: leagueConfigs } = await supabase
    .from('monitored_leagues')
    .select('league_key, api_sports_id, current_season, sport, country')
    .in('league_key', Array.from(activeLeagues))
    .filter('api_sports_id', 'not.is', null);

  if (leagueConfigs) {
    for (const config of leagueConfigs) {
      // Sincroniza todos os times desta liga para popular o cache
      await syncLeagueTeamsBulk(supabase, config.sport, config.api_sports_id, config.current_season || 2024, config.country);
    }
  }

  // Agora re-varre os eventos e atualiza as logos (usando o cache recém populado)
  const uniqueTeams = new Set<string>();
  const teamContext: Record<string, { sport: string, country: string }> = {};
  
  for (const ev of events) {
    uniqueTeams.add(ev.home_team);
    uniqueTeams.add(ev.away_team);
    teamContext[ev.home_team] = { sport: ev.sport, country: ev.country };
    teamContext[ev.away_team] = { sport: ev.sport, country: ev.country };
  }

  const teamLogoMap: Record<string, string | null> = {};
  await Promise.all(Array.from(uniqueTeams).map(async (teamName) => {
    const ctx = teamContext[teamName];
    teamLogoMap[teamName] = await getOrSearchTeamLogo(supabase, teamName, ctx.sport, triggeredBy, ctx.country);
  }));

  // Atualiza no banco
  const { data: eventsToUpdate } = await supabase
    .from('daily_events')
    .select('id, home_team, away_team, sport, league_key')
    .eq('event_date', today);

  let updatedCount = 0;
  for (const ev of eventsToUpdate) {
    const { error } = await supabase
      .from('daily_events')
      .update({
        home_team_logo: teamLogoMap[ev.home_team],
        away_team_logo: teamLogoMap[ev.away_team]
      })
      .eq('id', ev.id);
    if (!error) updatedCount++;
  }

  return { updatedCount };
}

Deno.serve(async (req) => {
  return await withMiddleware(req, FN_NAME, async (auth, request) => {
    const url = new URL(request.url);
    const path = url.pathname.split('/').pop();
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: profile } = await supabase.from('profiles').select('is_system_owner').eq('id', auth.userId).single();
    if (!profile?.is_system_owner) {
      return new Response(JSON.stringify({ error: 'Acesso restrito.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST' && path === 'run-job') {
      const { job } = await request.json();
      
      if (job === 'fetch_events') {
        // @ts-ignore
        EdgeRuntime.waitUntil((async () => {
          try {
            const results = await syncDailyEvents(supabase, 'manual');
            console.log(`Job fetch_events completed. Saved: ${results.totalSaved}`);
          } catch (err) { console.error('Job fetch_events failed:', err); }
        })());
        return new Response(JSON.stringify({ success: true, result: { queued: true, message: 'Sincronização de jogos iniciada.' } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (job === 'sync_logos') {
        // @ts-ignore
        EdgeRuntime.waitUntil((async () => {
          try {
            const result = await syncLogosForToday(supabase);
            console.log(`Job sync_logos completed. Updated: ${result.updatedCount}`);
          } catch (err) { console.error('Job sync_logos failed:', err); }
        })());
        return new Response(JSON.stringify({ success: true, result: { queued: true, message: 'Sincronização de escudos iniciada em background com busca por liga.' } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  });
});
