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

const TEAM_ID_MAP: Record<string, { sport: string, id: number }> = {
  // BRASILEIRÃO
  'Flamengo':              { sport: 'soccer', id: 127  },
  'Palmeiras':             { sport: 'soccer', id: 121  },
  'Atletico Mineiro':      { sport: 'soccer', id: 1062 },
  'Atletico Goianiense':   { sport: 'soccer', id: 1193 },
  'Corinthians':           { sport: 'soccer', id: 131  },
  'Sao Paulo':             { sport: 'soccer', id: 126  },
  'Internacional':         { sport: 'soccer', id: 119  },
  'Gremio':                { sport: 'soccer', id: 120  },
  'Fluminense':            { sport: 'soccer', id: 124  },
  'Botafogo':              { sport: 'soccer', id: 116  },
  'Santos':                { sport: 'soccer', id: 123  },
  'Cruzeiro':              { sport: 'soccer', id: 140  },
  'Bahia':                 { sport: 'soccer', id: 118  },
  'Vasco da Gama':         { sport: 'soccer', id: 130  },
  'Atletico Paranaense':   { sport: 'soccer', id: 117  },
  'Fortaleza':             { sport: 'soccer', id: 2019 },
  'Bragantino':            { sport: 'soccer', id: 2022 },
  'Coritiba':              { sport: 'soccer', id: 136  },
  'Sport Recife':          { sport: 'soccer', id: 128  },
  'Ceara':                 { sport: 'soccer', id: 2020 },
  // PREMIER LEAGUE
  'Arsenal':               { sport: 'soccer', id: 42   },
  'Chelsea':               { sport: 'soccer', id: 49   },
  'Liverpool':             { sport: 'soccer', id: 40   },
  'Manchester City':       { sport: 'soccer', id: 50   },
  'Manchester United':     { sport: 'soccer', id: 33   },
  'Tottenham':             { sport: 'soccer', id: 47   },
  'Newcastle United':      { sport: 'soccer', id: 34   },
  'Aston Villa':           { sport: 'soccer', id: 66   },
  'West Ham United':       { sport: 'soccer', id: 48   },
  'Brighton':              { sport: 'soccer', id: 51   },
  'Brentford':             { sport: 'soccer', id: 55   },
  'Fulham':                { sport: 'soccer', id: 36   },
  'Crystal Palace':        { sport: 'soccer', id: 52   },
  'Everton':               { sport: 'soccer', id: 45   },
  'Wolverhampton':         { sport: 'soccer', id: 39   },
  'Nottingham Forest':     { sport: 'soccer', id: 65   },
  'Bournemouth':           { sport: 'soccer', id: 35   },
  'Leicester City':        { sport: 'soccer', id: 46   },
  'Ipswich':               { sport: 'soccer', id: 57   },
  'Southampton':           { sport: 'soccer', id: 41   },
  // BUNDESLIGA
  'Bayern Munich':         { sport: 'soccer', id: 157  },
  'Borussia Dortmund':     { sport: 'soccer', id: 165  },
  'RB Leipzig':            { sport: 'soccer', id: 173  },
  'Bayer Leverkusen':      { sport: 'soccer', id: 168  },
  'Eintracht Frankfurt':   { sport: 'soccer', id: 169  },
  'Stuttgart':             { sport: 'soccer', id: 172  },
  'Wolfsburg':             { sport: 'soccer', id: 161  },
  'Freiburg':              { sport: 'soccer', id: 160  },
  'Borussia Monchengladbach': { sport: 'soccer', id: 163 },
  'SC Paderborn':          { sport: 'soccer', id: 188  },
  'VfL Wolfsburg':         { sport: 'soccer', id: 161  },
  // LA LIGA
  'Real Madrid':           { sport: 'soccer', id: 541  },
  'Barcelona':             { sport: 'soccer', id: 529  },
  'Atletico Madrid':       { sport: 'soccer', id: 530  },
  'Sevilla':               { sport: 'soccer', id: 536  },
  'Real Sociedad':         { sport: 'soccer', id: 548  },
  'Villarreal':            { sport: 'soccer', id: 533  },
  'Athletic Club':         { sport: 'soccer', id: 531  },
  'Valencia':              { sport: 'soccer', id: 532  },
  'Real Betis':            { sport: 'soccer', id: 543  },
  // SERIE A
  'Inter':                 { sport: 'soccer', id: 505  },
  'AC Milan':              { sport: 'soccer', id: 489  },
  'Juventus':              { sport: 'soccer', id: 496  },
  'Napoli':                { sport: 'soccer', id: 492  },
  'AS Roma':               { sport: 'soccer', id: 497  },
  'Lazio':                 { sport: 'soccer', id: 487  },
  'Fiorentina':            { sport: 'soccer', id: 502  },
  'Atalanta':              { sport: 'soccer', id: 499  },
  'Torino':                { sport: 'soccer', id: 503  },
  'Bologna':               { sport: 'soccer', id: 500  },
  // CHAMPIONS LEAGUE (times adicionais)
  'PSG':                   { sport: 'soccer', id: 85   },
  'Paris Saint Germain':   { sport: 'soccer', id: 85   },
  'Benfica':               { sport: 'soccer', id: 211  },
  'Porto':                 { sport: 'soccer', id: 212  },
  'Ajax':                  { sport: 'soccer', id: 194  },
  'Sporting CP':           { sport: 'soccer', id: 228  },
  'Celtic':                { sport: 'soccer', id: 396  },
  'Rangers':               { sport: 'soccer', id: 397  },
  // NBA
  'Los Angeles Lakers':    { sport: 'basketball', id: 37  },
  'Golden State Warriors': { sport: 'basketball', id: 11  },
  'Boston Celtics':        { sport: 'basketball', id: 2   },
  'Miami Heat':            { sport: 'basketball', id: 20  },
  'Chicago Bulls':         { sport: 'basketball', id: 8   },
  'Brooklyn Nets':         { sport: 'basketball', id: 4   },
  'Milwaukee Bucks':       { sport: 'basketball', id: 26  },
  'Phoenix Suns':          { sport: 'basketball', id: 28  },
  'Denver Nuggets':        { sport: 'basketball', id: 10  },
  'Dallas Mavericks':      { sport: 'basketball', id: 9   },
  'Oklahoma City Thunder': { sport: 'basketball', id: 25  },
  'Indiana Pacers':        { sport: 'basketball', id: 16  },
  'New York Knicks':       { sport: 'basketball', id: 22  },
  'Cleveland Cavaliers':   { sport: 'basketball', id: 7   },
  'Minnesota Timberwolves':{ sport: 'basketball', id: 21  },
  'Indiana Pacers':        { sport: 'basketball', id: 16  },
  'Atlanta Hawks':         { sport: 'basketball', id: 1   },
  'Charlotte Hornets':     { sport: 'basketball', id: 5   },
  'Cleveland Cavaliers':   { sport: 'basketball', id: 7   },
  'Detroit Pistons':       { sport: 'basketball', id: 11  },
  'Orlando Magic':         { sport: 'basketball', id: 24  },
  'Philadelphia 76ers':    { sport: 'basketball', id: 27  },
  'Toronto Raptors':       { sport: 'basketball', id: 33  },
  'Washington Wizards':    { sport: 'basketball', id: 40  },
  'Houston Rockets':       { sport: 'basketball', id: 14  },
  'Memphis Grizzlies':     { sport: 'basketball', id: 18  },
  'New Orleans Pelicans':  { sport: 'basketball', id: 23  },
  'San Antonio Spurs':     { sport: 'basketball', id: 31  },
  'Denver Nuggets':        { sport: 'basketball', id: 10  },
  'Minnesota Timberwolves':{ sport: 'basketball', id: 21  },
  'Oklahoma City Thunder': { sport: 'basketball', id: 25  },
  'Portland Trail Blazers':{ sport: 'basketball', id: 29  },
  'Utah Jazz':              { sport: 'basketball', id: 34  },
  'Sacramento Kings':      { sport: 'basketball', id: 30  },
  'LA Clippers':           { sport: 'basketball', id: 19  },
  // NHL
  'Tampa Bay Lightning':   { sport: 'hockey', id: 30  },
  'Colorado Avalanche':    { sport: 'hockey', id: 7   },
  'Vegas Golden Knights':  { sport: 'hockey', id: 34  },
  'Toronto Maple Leafs':   { sport: 'hockey', id: 31  },
  'Boston Bruins':         { sport: 'hockey', id: 1   },
  'New York Rangers':      { sport: 'hockey', id: 20  },
  'Carolina Hurricanes':   { sport: 'hockey', id: 6   },
  'Florida Panthers':      { sport: 'hockey', id: 13  },
  // ADICIONAIS SOLICITADOS
  'Nice':                  { sport: 'soccer', id: 84   },
  'Saint Etienne':         { sport: 'soccer', id: 1063 },
  'Palestino':             { sport: 'soccer', id: 2309 },
  'Athletic Club':         { sport: 'soccer', id: 10325 }, // MG
  'Athletic Bilbao':       { sport: 'soccer', id: 531  },
  'Greuther Furth':        { sport: 'soccer', id: 184  },
  'Rot-Weiss Essen':       { sport: 'soccer', id: 504  },
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
  'basketball_nba':                    { sport: 'basketball', id: 12  },
  'basketball_euroleague':             { sport: 'basketball', id: 120 },
  'icehockey_nhl':                     { sport: 'icehockey', id: 57 },
  'americanfootball_nfl':              { sport: 'americanfootball', id: 1 },
  'baseball_mlb':                      { sport: 'baseball', id: 1 },
};

// Lista completa de todas as ligas monitoradas
const ALL_LEAGUES = [
  { sport: 'soccer', key: 'soccer_brazil_campeonato', name: 'Brasileirão Série A', flag: '🇧🇷', continent: 'América do Sul', country: 'Brasil', type: 'league' },
  { sport: 'soccer', key: 'soccer_brazil_serie_b', name: 'Série B', flag: '🇧🇷', continent: 'América do Sul', country: 'Brasil', type: 'league' },
  { sport: 'soccer', key: 'soccer_epl', name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', continent: 'Europa', country: 'Inglaterra', type: 'league' },
  { sport: 'soccer', key: 'soccer_germany_bundesliga', name: 'Bundesliga', flag: '🇩🇪', continent: 'Europa', country: 'Alemanha', type: 'league' },
  { sport: 'soccer', key: 'soccer_spain_la_liga', name: 'La Liga', flag: '🇪🇸', continent: 'Europa', country: 'Espanha', type: 'league' },
  { sport: 'soccer', key: 'soccer_italy_serie_a', name: 'Serie A', flag: '🇮🇹', continent: 'Europa', country: 'Itália', type: 'league' },
  { sport: 'soccer', key: 'soccer_france_ligue_one', name: 'Ligue 1', flag: '🇫🇷', continent: 'Europa', country: 'França', type: 'league' },
  { sport: 'soccer', key: 'soccer_uefa_champs_league', name: 'Champions League', flag: '🏆', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'soccer', key: 'soccer_uefa_europa_league', name: 'Europa League', flag: '🏆', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'soccer', key: 'soccer_usa_mls', name: 'MLS', flag: '🇺🇸', continent: 'América do Norte', country: 'EUA', type: 'league' },
  { sport: 'soccer', key: 'soccer_mexico_ligamx', name: 'Liga MX', flag: '🇲🇽', continent: 'América do Norte', country: 'México', type: 'league' },
  { sport: 'soccer', key: 'soccer_argentina_primera_division', name: 'Liga Argentina', flag: '🇦🇷', continent: 'América do Sul', country: 'Argentina', type: 'league' },
  { sport: 'soccer', key: 'soccer_saudi_professional_league', name: 'Saudi Pro League', flag: '🇸🇦', continent: 'Oriente Médio', country: 'Arábia Saudita', type: 'league' },
  { sport: 'soccer', key: 'soccer_turkey_super_league', name: 'Süper Lig', flag: '🇹🇷', continent: 'Europa', country: 'Turquia', type: 'league' },
  { sport: 'soccer', key: 'soccer_netherlands_eredivisie', name: 'Eredivisie', flag: '🇳🇱', continent: 'Europa', country: 'Holanda', type: 'league' },
  { sport: 'soccer', key: 'soccer_portugal_primeira_liga', name: 'Primeira Liga', flag: '🇵🇹', continent: 'Europa', country: 'Portugal', type: 'league' },
  { sport: 'basketball', key: 'basketball_nba', name: 'NBA', flag: '🇺🇸', continent: 'América do Norte', country: 'EUA', type: 'league' },
  { sport: 'basketball', key: 'basketball_euroleague', name: 'EuroLeague', flag: '🇪🇺', continent: 'Europa', country: 'Continental', type: 'continental' },
  { sport: 'icehockey', key: 'icehockey_nhl', name: 'NHL', flag: '🇺🇸', continent: 'América do Norte', country: 'EUA', type: 'league' },
];

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunked: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

async function getOrSearchTeamLogo(supabase: any, teamName: string, sport: string, triggeredBy: string) {
  // 1. Mapa estático (zero custo, instantâneo)
  const staticMapping = TEAM_ID_MAP[teamName];
  if (staticMapping) {
    const bases: Record<string, string> = {
      soccer:      'https://media.api-sports.io/football/teams',
      basketball:  'https://media.api-sports.io/basketball/teams',
      hockey:      'https://media.api-sports.io/hockey/teams',
      baseball:    'https://media.api-sports.io/baseball/teams',
      americanfootball: 'https://media.api-sports.io/american-football/teams',
    };
    const sportKey = staticMapping.sport || sport;
    return `${bases[sportKey] || bases.soccer}/${staticMapping.id}.png`;
  }

  // 2. Cache no banco de dados
  const normalized = teamName.toLowerCase().trim();
  const { data: cached } = await supabase
    .from('team_logos')
    .select('logo_url, found')
    .eq('sport', sport)
    .eq('team_name_normalized', normalized)
    .maybeSingle();

  if (cached) return cached.found ? cached.logo_url : null;

  // 3. Busca reativa na API (Apenas se não mapeado e não em cache)
  const apiEndpoint = API_SPORTS_ENDPOINTS[sport] || API_SPORTS_ENDPOINTS.soccer;
  const searchUrl = `${apiEndpoint}/teams?name=${encodeURIComponent(teamName)}`;

  try {
    const result = await callExternalApi({
      apiName: 'api_football', // Usa o wrapper que já tem o header correto
      endpoint: searchUrl,
      sportKey: sport,
      creditsUsed: 1,
      triggeredBy: triggeredBy as any
    });

    let logoUrl = null;
    let apiId = null;

    if (result.data?.response?.length > 0) {
      // Pega o primeiro resultado da busca por nome
      const teamRes = result.data.response[0];
      const team = teamRes.team || teamRes; // Depende da API de cada esporte
      logoUrl = team.logo;
      apiId = team.id;
    }

    // Salva no cache para não cobrar novamente
    await supabase.from('team_logos').upsert({
      sport,
      team_name_normalized: normalized,
      team_name_original: teamName,
      api_sports_id: apiId,
      logo_url: logoUrl,
      found: !!logoUrl,
      searched_at: new Date().toISOString()
    }, { onConflict: 'sport,team_name_normalized' });

    return logoUrl;
  } catch (err) {
    console.error(`Erro ao buscar escudo para ${teamName}:`, err);
    return null;
  }
}

async function getLeagueLogo(supabase: any, leagueKey: string, sport: string) {
  const { data: cached } = await supabase
    .from('league_logos')
    .select('logo_url, found')
    .eq('sport', sport)
    .eq('league_key', leagueKey)
    .maybeSingle();

  if (cached) return cached.found ? cached.logo_url : null;

  const mapping = LEAGUE_ID_MAP[leagueKey];
  if (!mapping) return null;

  const logoUrl = `${LEAGUE_LOGO_BASE_URLS[mapping.sport]}/${mapping.id}.png`;

  await supabase.from('league_logos').upsert({
    sport,
    league_key: leagueKey,
    api_sports_id: mapping.id,
    logo_url: logoUrl,
    found: true,
    searched_at: new Date().toISOString()
  }, { onConflict: 'sport,league_key' });

  return logoUrl;
}

async function fetchLeagueEvents(supabase: any, league: any, apiKey: string, triggeredBy: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

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

    // Otimização: Coletar todos os nomes de times únicos para buscar escudos em paralelo
    const uniqueTeams = new Set<string>();
    for (const ev of events) {
      uniqueTeams.add(ev.home_team);
      uniqueTeams.add(ev.away_team);
    }

    const teamLogoMap: Record<string, string | null> = {};
    await Promise.all(Array.from(uniqueTeams).map(async (teamName) => {
      teamLogoMap[teamName] = await getOrSearchTeamLogo(supabase, teamName, league.sport, triggeredBy);
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
        }, { 
          onConflict: 'api_id' 
        });

      if (!error) savedCount++;
    }
    return savedCount;
  } catch (err) {
    console.error(`[ERROR] ${league.key}:`, err instanceof Error ? err.message : String(err));
    return 0;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function syncMonitoredLeagues(supabase: any) {
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
}

async function syncDailyEvents(supabase: any, triggeredBy: 'cron' | 'manual' = 'cron') {
  const apiKey = Deno.env.get('ODDS_API_KEY');
  if (!apiKey) throw new Error('ODDS_API_KEY not set');

  await syncMonitoredLeagues(supabase);

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
    .select('id, home_team, away_team, sport, league_key')
    .eq('event_date', today);

  if (!events) return { updated: 0 };

  // Otimização: Coletar todos os times únicos por esporte
  const teamsBySport: Record<string, Set<string>> = {};
  for (const ev of events) {
    if (!teamsBySport[ev.sport]) teamsBySport[ev.sport] = new Set();
    teamsBySport[ev.sport].add(ev.home_team);
    teamsBySport[ev.sport].add(ev.away_team);
  }

  const teamLogoMap: Record<string, Record<string, string | null>> = {};
  
  for (const sport in teamsBySport) {
    teamLogoMap[sport] = {};
    const teams = Array.from(teamsBySport[sport]);
    await Promise.all(teams.map(async (teamName) => {
      teamLogoMap[sport][teamName] = await getOrSearchTeamLogo(supabase, teamName, sport, triggeredBy);
    }));
  }

  let updatedCount = 0;
  for (const ev of events) {
    const leagueLogo = await getLeagueLogo(supabase, ev.league_key, ev.sport);
    const { error } = await supabase
      .from('daily_events')
      .update({
        home_team_logo: teamLogoMap[ev.sport][ev.home_team],
        away_team_logo: teamLogoMap[ev.sport][ev.away_team],
        league_logo: leagueLogo
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

    if (request.method === 'GET' && path === 'summary') {
      const today = new Date().toISOString().split('T')[0];
      const month = today.slice(0, 7);
      const [dayStats, monthStats, lastCall] = await Promise.all([
        supabase.from('api_usage_summary').select('*').eq('period_type', 'day').eq('period_key', today),
        supabase.from('api_usage_summary').select('*').eq('period_type', 'month').eq('period_key', month),
        supabase.from('api_request_logs').select('*').order('created_at', { ascending: false }).limit(1).single()
      ]);
      return new Response(JSON.stringify({ today: dayStats.data || [], month: monthStats.data || [], lastCall: lastCall.data || null, limits: { odds_api: { monthly: 500 }, api_football: { daily: 100 } } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        return new Response(JSON.stringify({ success: true, result: { queued: true, message: 'Sincronização iniciada em background.' } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (job === 'sync_logos') {
        // @ts-ignore
        EdgeRuntime.waitUntil(syncLogosForToday(supabase).catch(err => console.error('Job sync_logos failed:', err)));
        return new Response(JSON.stringify({ success: true, result: { queued: true, message: 'Sincronização de escudos iniciada.' } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  });
});