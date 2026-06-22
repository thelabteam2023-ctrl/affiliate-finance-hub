import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withMiddleware, corsHeaders } from '../_shared/middleware.ts';
import { callExternalApi } from '../_shared/apiWrapper.ts';

const FN_NAME = 'api-monitor';

const API_SPORTS_ENDPOINTS: Record<string, string> = {
  soccer:           'https://v3.football.api-sports.io',
  basketball:       'https://v1.basketball.api-sports.io',
  icehockey:        'https://v1.hockey.api-sports.io',
  baseball:         'https://v1.baseball.api-sports.io',
  americanfootball: 'https://v1.american-football.api-sports.io',
  tennis:           'https://v1.tennis.api-sports.io',
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

function normalizeTeamMatchKey(name: string): string {
  if (!name) return '';
  const stopWords = new Set(['fc', 'cf', 'cd', 'sc', 'ac', 'club', 'de', 'da', 'do', 'del', 'di', 'du', 'la', 'le', 'el', 'the']);
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !stopWords.has(token))
    .sort()
    .join('');
}

function tokenizeTeamName(name: string): string[] {
  const stopWords = new Set(['fc', 'cf', 'cd', 'sc', 'ac', 'club', 'clube', 'de', 'da', 'do', 'del', 'di', 'du', 'la', 'le', 'el', 'the']);
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 6 && !stopWords.has(token));
}

const GENERIC_LOGO_MATCH_TOKENS = new Set([
  'athletic', 'atletico', 'sporting', 'racing', 'central', 'united',
  'city', 'real', 'deportivo', 'nacional', 'independiente', 'wanderers',
  'rangers', 'rovers', 'county', 'town',
]);

function isSafeTokenLogoMatch(queryName: string, candidateName: string): boolean {
  const queryTokens = tokenizeTeamName(queryName);
  const candidateTokens = tokenizeTeamName(candidateName);
  if (!queryTokens.length || !candidateTokens.length) return false;
  const qSet = new Set(queryTokens);
  const matchedTokens = candidateTokens.filter((token) => qSet.has(token));
  const minSide = Math.min(queryTokens.length, candidateTokens.length);
  if (matchedTokens.length < minSide) return false;
  if (minSide === 1) {
    const onlyToken = matchedTokens[0];
    if (!onlyToken || onlyToken.length < 7 || GENERIC_LOGO_MATCH_TOKENS.has(onlyToken)) return false;
  }
  return true;
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

const API_SPORTS_COUNTRY_MAP: Record<string, string> = {
  'Brasil': 'Brazil',
  'Alemanha': 'Germany',
  'França': 'France',
  'Itália': 'Italy',
  'Espanha': 'Spain',
  'Inglaterra': 'England',
  'Holanda': 'Netherlands',
  'Equador': 'Ecuador',
  'Uruguai': 'Uruguay',
  'Paraguai': 'Paraguay',
  'Peru': 'Peru',
  'Argentina': 'Argentina',
};

function toApiSportsCountry(country?: string) {
  if (!country) return null;
  return API_SPORTS_COUNTRY_MAP[country] || country;
}

/**
 * Lookup de escudo via cache indexado por (league_key, nome_normalizado).
 * Ordem: (1) match exato em team_logos, (2) alias em team_name_aliases,
 * (3) fallback substring na mesma liga. Sempre escopo por league_key.
 */
async function lookupTeamLogo(supabase: any, teamName: string, leagueKey: string): Promise<string | null> {
  const normalized = normalizeTeamName(teamName);
  const matchKey = normalizeTeamMatchKey(teamName);
  const { data } = await supabase
    .from('team_logos')
    .select('logo_url, found')
    .eq('league_key', leagueKey)
    .eq('team_name_normalized', normalized)
    .maybeSingle();
  if (data?.found) return data.logo_url;

  // Alias lookup: nomes divergentes Odds API vs API-Sports
  const { data: alias } = await supabase
    .from('team_name_aliases')
    .select('team_logos!inner(logo_url, found)')
    .eq('league_key', leagueKey)
    .eq('alias_normalized', normalized)
    .maybeSingle();
  const aliasLogo = (alias as any)?.team_logos;
  if (aliasLogo?.found && aliasLogo.logo_url) return aliasLogo.logo_url;

  // Fallback resiliente: nomes parciais (ex: "Wolves" vs "Wolverhampton Wanderers")
  if (normalized.length >= 4) {
    const { data: rows } = await supabase
      .from('team_logos')
      .select('logo_url, team_name_normalized, found')
      .eq('league_key', leagueKey)
      .eq('found', true);
    if (rows?.length) {
      const match = rows.find((r: any) =>
        r.team_name_normalized.includes(normalized) ||
        normalized.includes(r.team_name_normalized)
      );
      if (match) return match.logo_url;
    }
  }

  // Fallback global seguro: procura o mesmo time em outras ligas do mesmo esporte
  // (ex.: cache nacional do Peru/Equador alimentando Libertadores/Sudamericana).
  // Só aceita se houver um único logo distinto para evitar confundir homônimos.
  if (matchKey.length >= 4) {
    const sport = leagueKey.split('_')[0] || 'soccer';
    const { data: globalRows } = await supabase
      .from('team_logos')
      .select('logo_url, team_name_original, found')
      .eq('sport', sport)
      .eq('found', true);
    const matches = (globalRows || []).filter((r: any) => {
      const candidateKey = normalizeTeamMatchKey(r.team_name_original || '');
      return candidateKey && (
        candidateKey === matchKey ||
        candidateKey.includes(matchKey) ||
        matchKey.includes(candidateKey)
      );
    });
    const uniqueLogos = Array.from(new Set(matches.map((r: any) => r.logo_url).filter(Boolean)));
    if (uniqueLogos.length === 1) return uniqueLogos[0] as string;
  }
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
  // FORMATO DE TEMPORADA por esporte (confirmado por sondagem direta na API-Sports):
  //  - basketball: "YYYY-YYYY"   (ex.: "2024-2025")
  //  - icehockey:  "YYYY"          (API rejeita formato com hífen)
  //  - americanfootball: "YYYY"   (API rejeita formato com hífen)
  //  - soccer/baseball: "YYYY"
  const usesRangeSeason = sport === 'basketball';
  const formatSeason = (s: number) =>
    usesRangeSeason ? `${s}-${s + 1}` : String(s);
  // Plano free da API-Sports só libera até 2024 (configurável via API_SPORTS_MAX_SEASON).
  // Quando o usuário fizer upgrade, basta definir o secret API_SPORTS_MAX_SEASON=2026.
  const maxSeasonEnv = Number(Deno.env.get('API_SPORTS_MAX_SEASON'));
  const maxSeason = Number.isFinite(maxSeasonEnv) && maxSeasonEnv > 2000
    ? maxSeasonEnv
    : 2024;
  const startSeason = Math.min(season, maxSeason);
  const seasonsToTry = Array.from(
    new Set([startSeason, startSeason - 1, startSeason - 2]),
  ).filter((s) => s > 2000);
  let result: any = null;
  let usedSeason: number | string = formatSeason(startSeason);

  try {
    for (const s of seasonsToTry) {
      const seasonParam = formatSeason(s);
      const url = `${apiEndpoint}/teams?league=${leagueId}&season=${encodeURIComponent(seasonParam)}`;
      console.log(`[BULK SYNC] ${leagueKey} (league=${leagueId}, season=${seasonParam}, sport=${sport})`);
      result = await callExternalApi({
        apiName: 'api_football',
        endpoint: url,
        sportKey: sport,
        creditsUsed: 1,
        triggeredBy: 'manual'
      });
      if (result.data?.response?.length) {
        usedSeason = seasonParam;
        break;
      }
      console.warn(`[BULK SYNC] ${leagueKey} season=${seasonParam}: vazio${result.errorMessage ? ` (${result.errorMessage})` : ''}`);
    }

    // Fallback: alguns campeonatos de baixa liquidez retornam vazio por league/season,
    // mas a API ainda expõe os clubes pelo país. Isso popula o cache de escudos sem
    // passar a trazer jogos dessas ligas para o calendário.
    if (!result?.data?.response?.length) {
      const apiCountry = toApiSportsCountry(country);
      if (apiCountry) {
        const countryUrl = `${apiEndpoint}/teams?country=${encodeURIComponent(apiCountry)}`;
        console.log(`[BULK SYNC] ${leagueKey}: fallback por país (${apiCountry})`);
        result = await callExternalApi({
          apiName: 'api_football',
          endpoint: countryUrl,
          sportKey: sport,
          creditsUsed: 1,
          triggeredBy: 'manual'
        });
        usedSeason = `country:${apiCountry}`;
      }
    }

    if (!result?.data?.response?.length) {
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
    console.log(`[BULK SYNC] ${leagueKey} (season=${usedSeason}): ${saved} times salvos`);
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
  // Rate-limit do plano free: 10 req/min. Processa serialmente com delay de 7s
  // entre ligas (cada liga consome 1-3 requisições devido às tentativas de season).
  for (const lg of leagues) {
    const saved = await syncLeagueTeamsBulk(
      supabase, lg.sport, lg.league_key, lg.api_sports_id,
      lg.current_season || 2024, lg.country,
    );
    totalTeams += saved;
    await new Promise((r) => setTimeout(r, 7000));
  }
  return { syncedLeagues: leagues.length, totalTeams };
}

/**
 * Sincroniza APENAS as ligas que ainda não têm nenhum time no cache.
 * Processa serialmente para evitar rate-limit e timeout.
 */
async function syncMissingLeaguesOnly(supabase: any) {
  const { data: leagues } = await supabase
    .from('monitored_leagues')
    .select('league_key, sport, api_sports_id, current_season, country')
    .eq('is_active', true)
    .not('api_sports_id', 'is', null);

  if (!leagues?.length) return { processed: 0, totalTeams: 0, skipped: 0 };

  // Filtra apenas ligas com 0 times no cache
  const { data: existing } = await supabase
    .from('team_logos')
    .select('league_key');
  const hasCache = new Set<string>((existing || []).map((r: any) => r.league_key));
  const missing = leagues.filter((l: any) => !hasCache.has(l.league_key));

  console.log(`[SYNC MISSING] ${missing.length} ligas sem cache de times (de ${leagues.length} total)`);

  let totalTeams = 0;
  let processed = 0;
  for (const lg of missing) {
    try {
      const saved = await syncLeagueTeamsBulk(
        supabase, lg.sport, lg.league_key, lg.api_sports_id, lg.current_season || 2024, lg.country,
      );
      totalTeams += saved;
      processed++;
      // Rate-limit api-sports free = 10 req/min. Cada liga = 1-3 reqs (tenta 3 seasons).
      // 7s entre ligas mantém folga e evita "Too many requests".
      await new Promise((r) => setTimeout(r, 7000));
    } catch (err) {
      console.error(`[SYNC MISSING] erro ${lg.league_key}:`, err);
    }
  }
  return { processed, totalTeams, skipped: leagues.length - missing.length };
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

async function fetchLeagueEvents(supabase: any, league: any, triggeredBy: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const endpoint = `https://api.the-odds-api.com/v4/sports/${league.key}/events?dateFormat=iso`;
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
      teamLogoMap[teamName] = await lookupTeamLogo(supabase, teamName, league.key);
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
    const results = await Promise.all(chunk.map(league => fetchLeagueEvents(supabase, league, triggeredBy)));
    totalSaved += results.reduce((a, b) => a + b, 0);
  }

  return { totalSaved };
}

async function syncLogosForToday(supabase: any, triggeredBy: string = 'manual') {
  const today = new Date().toISOString().split('T')[0];
  // Opção rápida: aplica match exato + aliases + fallback substring em uma única RPC.
  // Não re-chama syncLeagueTeamsBulk aqui — isso é responsabilidade do job sync_all_teams.
  const { data, error } = await supabase.rpc('backfill_daily_event_logos', { p_date: today });
  if (error) {
    console.error('[syncLogosForToday] RPC error:', error.message);
    return { updatedCount: 0 };
  }
  const total = (data as any)?.total ?? 0;
  console.log(`[syncLogosForToday] backfill:`, data);
  return { updatedCount: total };
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

    // ===== GET /summary =====
    if (request.method === 'GET' && path === 'summary') {
      const todayKey = new Date().toISOString().split('T')[0];
      const monthKey = todayKey.substring(0, 7);

      const [todayRes, monthRes, lastRes] = await Promise.all([
        supabase.from('api_usage_summary').select('api_name,total_calls,total_credits,total_errors')
          .eq('period_type', 'day').eq('period_key', todayKey),
        supabase.from('api_usage_summary').select('api_name,total_calls,total_credits,total_errors')
          .eq('period_type', 'month').eq('period_key', monthKey),
        supabase.from('api_request_logs').select('api_name,created_at,status_code,duration_ms')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      const limits = {
        odds_api: { daily: null as number | null, monthly: 20000 },
        api_football: { daily: 100, monthly: null as number | null },
      };

      return new Response(JSON.stringify({
        today: todayRes.data || [],
        month: monthRes.data || [],
        lastCall: lastRes.data || null,
        limits,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== GET /logs =====
    if (request.method === 'GET' && path === 'logs') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 100);
      const { data, error } = await supabase.from('api_request_logs')
        .select('id,api_name,endpoint,sport_key,status_code,credits_used,records_returned,duration_ms,error_message,triggered_by,created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        return new Response(JSON.stringify({ error: error.message, logs: [] }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ logs: data || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== GET /preview =====
    if (request.method === 'GET' && path === 'preview') {
      const apiName = (url.searchParams.get('api') || 'odds_api') as 'odds_api' | 'api_football';
      const sportKey = url.searchParams.get('sport') || 'soccer_epl';
      const endpoint = apiName === 'odds_api'
        ? `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?regions=eu&markets=h2h`
        : `https://v3.football.api-sports.io/fixtures?league=39&season=2024&next=5`;
      try {
        const result = await callExternalApi({ apiName, endpoint, sportKey, creditsUsed: 1, triggeredBy: 'manual' });
        return new Response(JSON.stringify({
          statusCode: result.statusCode,
          durationMs: result.durationMs,
          recordsReturned: result.recordsReturned,
          url: endpoint,
          rawData: result.data,
          error: result.errorMessage,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err?.message || 'Preview failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (request.method === 'POST' && path === 'run-job') {
      const body = await request.json().catch(() => ({}));
      const { job, leagueKey } = body as { job: string; leagueKey?: string };

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

      if (job === 'sync_all_teams') {
        // @ts-ignore
        EdgeRuntime.waitUntil((async () => {
          try {
            const result = await syncAllTeams(supabase);
            console.log(`Job sync_all_teams completed:`, result);
            // Após popular o cache de todas as ligas, atualiza eventos do dia
            const upd = await syncLogosForToday(supabase);
            console.log(`  → eventos atualizados: ${upd.updatedCount}`);
          } catch (err) { console.error('Job sync_all_teams failed:', err); }
        })());
        return new Response(JSON.stringify({ success: true, result: { queued: true, message: 'Sincronização completa iniciada (todas as ligas, ~30 créditos).' } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (job === 'sync_missing_only') {
        // @ts-ignore
        EdgeRuntime.waitUntil((async () => {
          try {
            const result = await syncMissingLeaguesOnly(supabase);
            console.log(`Job sync_missing_only completed:`, result);
            const today = new Date().toISOString().split('T')[0];
            await supabase.rpc('backfill_daily_event_logos', { p_date: today });
          } catch (err) { console.error('Job sync_missing_only failed:', err); }
        })());
        return new Response(JSON.stringify({ success: true, result: { queued: true, message: 'Sincronizando ligas faltantes em background. Atualize em ~3min.' } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (job === 'sync_league_teams') {
        if (!leagueKey) {
          return new Response(JSON.stringify({ error: 'leagueKey required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const { data: lg, error: lgErr } = await supabase
          .from('monitored_leagues')
          .select('league_key, sport, api_sports_id, current_season, country')
          .eq('league_key', leagueKey)
          .maybeSingle();
        if (lgErr || !lg) {
          return new Response(JSON.stringify({ error: 'Liga não encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (!lg.api_sports_id) {
          return new Response(JSON.stringify({ error: 'Liga sem api_sports_id configurado' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const saved = await syncLeagueTeamsBulk(
          supabase, lg.sport, lg.league_key, lg.api_sports_id, lg.current_season || 2024, lg.country || undefined,
        );
        // Backfill imediato para hoje
        await supabase.rpc('backfill_daily_event_logos', { p_date: new Date().toISOString().split('T')[0] });
        return new Response(JSON.stringify({ success: true, result: { leagueKey, teamsSaved: saved } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (job === 'reprocess_event_logos') {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase.rpc('backfill_daily_event_logos', { p_date: today });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: true, result: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  });
});
