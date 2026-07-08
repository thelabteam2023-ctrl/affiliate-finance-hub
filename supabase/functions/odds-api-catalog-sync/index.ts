// deno-lint-ignore-file no-explicit-any
// Odds API sync — catálogo de jogos (sem odds).
// Fonte SECUNDÁRIA: cobre ligas que o TheSportsDB gratuito não devolve
// (ex.: Brasileirão Série A/B, La Liga 2, Championship inglesa).
// UPSERT idempotente em sports_events via canonical_key compartilhada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildCanonicalKey,
  inferCompetitionType,
  normTeam,
  brtDateOf,
  COUNTRY_TO_CONTINENT,
} from "../_shared/catalogNormalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ODDS_BASE = "https://api.the-odds-api.com/v4";

// Catálogo curado de sport_keys. Endpoint /events NÃO consome quota.
// Cada entrada: chave do Odds API -> esporte interno, país, nome amigável da liga
type SportMap = {
  internal: string;
  country: string | null;
  league_name: string;
};
const SPORT_KEY_MAP: Record<string, SportMap> = {
  // ---------- Soccer ----------
  soccer_brazil_campeonato:      { internal: "soccer", country: "Brazil",    league_name: "Brasileirão Série A" },
  soccer_brazil_serie_b:         { internal: "soccer", country: "Brazil",    league_name: "Brasileirão Série B" },
  soccer_argentina_primera_division: { internal: "soccer", country: "Argentina", league_name: "Argentina Primera División" },
  soccer_chile_campeonato:       { internal: "soccer", country: "Chile",     league_name: "Chile Primera División" },
  soccer_conmebol_copa_america:  { internal: "soccer", country: null,        league_name: "Copa América" },
  soccer_conmebol_copa_libertadores: { internal: "soccer", country: null,    league_name: "Copa Libertadores" },
  soccer_conmebol_copa_sudamericana: { internal: "soccer", country: null,    league_name: "Copa Sudamericana" },
  soccer_epl:                    { internal: "soccer", country: "England",   league_name: "Premier League" },
  soccer_efl_champ:              { internal: "soccer", country: "England",   league_name: "EFL Championship" },
  soccer_england_league1:        { internal: "soccer", country: "England",   league_name: "EFL League One" },
  soccer_england_league2:        { internal: "soccer", country: "England",   league_name: "EFL League Two" },
  soccer_england_efl_cup:        { internal: "soccer", country: "England",   league_name: "EFL Cup" },
  soccer_fa_cup:                 { internal: "soccer", country: "England",   league_name: "FA Cup" },
  soccer_spain_la_liga:          { internal: "soccer", country: "Spain",     league_name: "La Liga" },
  soccer_spain_segunda_division: { internal: "soccer", country: "Spain",     league_name: "La Liga 2" },
  soccer_italy_serie_a:          { internal: "soccer", country: "Italy",     league_name: "Serie A" },
  soccer_italy_serie_b:          { internal: "soccer", country: "Italy",     league_name: "Serie B" },
  soccer_germany_bundesliga:     { internal: "soccer", country: "Germany",   league_name: "Bundesliga" },
  soccer_germany_bundesliga2:    { internal: "soccer", country: "Germany",   league_name: "Bundesliga 2" },
  soccer_france_ligue_one:       { internal: "soccer", country: "France",    league_name: "Ligue 1" },
  soccer_france_ligue_two:       { internal: "soccer", country: "France",    league_name: "Ligue 2" },
  soccer_portugal_primeira_liga: { internal: "soccer", country: "Portugal",  league_name: "Primeira Liga" },
  soccer_netherlands_eredivisie: { internal: "soccer", country: "Netherlands", league_name: "Eredivisie" },
  soccer_uefa_champs_league:     { internal: "soccer", country: null,        league_name: "UEFA Champions League" },
  soccer_uefa_champs_league_qualification: { internal: "soccer", country: null, league_name: "UEFA Champions League — Qualification" },
  soccer_uefa_europa_league:     { internal: "soccer", country: null,        league_name: "UEFA Europa League" },
  soccer_uefa_europa_conference_league: { internal: "soccer", country: null, league_name: "UEFA Conference League" },
  soccer_uefa_euro_qualification: { internal: "soccer", country: null,       league_name: "UEFA Euro Qualification" },
  soccer_uefa_nations_league:    { internal: "soccer", country: null,        league_name: "UEFA Nations League" },
  soccer_fifa_world_cup:         { internal: "soccer", country: null,        league_name: "FIFA World Cup" },
  soccer_fifa_world_cup_qualifiers_conmebol: { internal: "soccer", country: null, league_name: "World Cup Qualifiers — CONMEBOL" },
  soccer_mexico_ligamx:          { internal: "soccer", country: "Mexico",    league_name: "Liga MX" },
  soccer_usa_mls:                { internal: "soccer", country: "USA",       league_name: "MLS" },
  // ---------- Basketball ----------
  basketball_nba:                { internal: "basketball", country: "USA",   league_name: "NBA" },
  basketball_wnba:               { internal: "basketball", country: "USA",   league_name: "WNBA" },
  basketball_ncaab:              { internal: "basketball", country: "USA",   league_name: "NCAAB" },
  basketball_euroleague:         { internal: "basketball", country: null,    league_name: "EuroLeague" },
  // ---------- American Football ----------
  americanfootball_nfl:          { internal: "americanfootball", country: "USA", league_name: "NFL" },
  americanfootball_ncaaf:        { internal: "americanfootball", country: "USA", league_name: "NCAAF" },
  // ---------- Baseball ----------
  baseball_mlb:                  { internal: "baseball", country: "USA",     league_name: "MLB" },
  baseball_npb:                  { internal: "baseball", country: "Japan",   league_name: "NPB" },
  baseball_kbo:                  { internal: "baseball", country: "South Korea", league_name: "KBO" },
  // ---------- Ice Hockey ----------
  icehockey_nhl:                 { internal: "icehockey", country: "Canada", league_name: "NHL" },
  // ---------- Tennis (Odds API agrupa em ATP/WTA por torneio; mantemos os principais) ----------
  // (Os sport_keys de tênis no Odds API mudam por torneio; pulamos no MVP.)
};

interface NormalizedEvent {
  canonical_key: string;
  sport: string;
  home_team: string;
  away_team: string;
  home_team_normalized: string;
  away_team_normalized: string;
  home_team_logo: string | null;
  away_team_logo: string | null;
  league_id: string | null;
  league_name: string | null;
  league_logo: string | null;
  country: string | null;
  continent: string | null;
  competition_type: string;
  commence_time: string;
  event_date_brt: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  city: string | null;
  primary_source: "odds_api";
  sources: Record<string, any>;
  last_synced_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ODDS_API_KEY = Deno.env.get("ODDS_API_KEY");
  if (!ODDS_API_KEY) {
    return new Response(JSON.stringify({ error: "ODDS_API_KEY ausente" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let triggeredBy: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    try {
      const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      triggeredBy = data?.user?.id ?? null;
    } catch { /* ignore */ }
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const requestedKeys: string[] = Array.isArray(body?.sport_keys) && body.sport_keys.length
    ? body.sport_keys.filter((k: any) => typeof k === "string" && SPORT_KEY_MAP[k])
    : Object.keys(SPORT_KEY_MAP);

  if (requestedKeys.length === 0) {
    return new Response(JSON.stringify({
      error: "Nenhum sport_key válido", supported: Object.keys(SPORT_KEY_MAP),
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Cria run
  const { data: runIns, error: runErr } = await supabase
    .from("sports_sync_runs")
    .insert({
      status: "running",
      triggered_by: triggeredBy,
      params: { source: "odds_api", sport_keys: requestedKeys, requests: requestedKeys.length },
    })
    .select("id").single();
  if (runErr) {
    return new Response(JSON.stringify({ error: runErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runIns!.id as string;

  // ---- Background work: a função responde 202 imediatamente e segue trabalhando.
  // Evita o erro "Failed to send a request to the Edge Function" quando o trabalho
  // demora perto do limite de 60s do edge runtime (Odds API lenta, muitos esportes).
  const runWork = async () => {
    try {
      await doSyncWork(supabase, ODDS_API_KEY, requestedKeys, runId);
    } catch (e: any) {
      await supabase.from("sports_sync_runs").update({
        status: "error",
        error: (e?.message ?? String(e)).slice(0, 1000),
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
    }
  };
  // @ts-ignore EdgeRuntime é provido pelo runtime do Supabase
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(runWork());
  } else {
    // Fallback (dev local): dispara sem await mas não bloqueia a resposta.
    runWork();
  }

  return new Response(JSON.stringify({
    run_id: runId,
    status: "running",
    sport_keys: requestedKeys.length,
    message: "Sync iniciado em background. Acompanhe via sports_sync_runs.",
  }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

/**
 * Trabalho pesado movido para fora do handler — chamado via EdgeRuntime.waitUntil
 * para permitir resposta imediata ao cliente.
 */
async function doSyncWork(
  supabase: any,
  ODDS_API_KEY: string,
  requestedKeys: string[],
  runId: string,
) {
  // Fetch /events com pool de concorrência limitada (Odds API às vezes responde
  // 403 "challenge" quando recebe muitos requests simultâneos).
  const POOL = 8;
  const FETCH_TIMEOUT_MS = 12_000;
  const results: { sportKey: string; events: any[]; error?: string }[] = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= requestedKeys.length) return;
      const sportKey = requestedKeys[idx];
      const url = `${ODDS_BASE}/sports/${sportKey}/events?apiKey=${ODDS_API_KEY}`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const r = await fetch(url, { headers: { "Accept": "application/json" }, signal: ctrl.signal });
        if (!r.ok) {
          const txt = await r.text();
          results.push({ sportKey, events: [], error: `HTTP ${r.status}: ${txt.slice(0, 200)}` });
        } else {
          const j = await r.json();
          results.push({ sportKey, events: Array.isArray(j) ? j : [] });
        }
      } catch (e: any) {
        results.push({ sportKey, events: [], error: e?.message ?? String(e) });
      } finally {
        clearTimeout(t);
      }
    }
  }
  await Promise.all(Array.from({ length: POOL }, () => worker()));
  const fetchErrors = results.filter((r) => r.error).map((r) => ({ sport_key: r.sportKey, error: r.error }));

  // Pré-carrega caches de logos
  const { data: leagueLogoCache } = await supabase
    .from("league_logos").select("sport,league_key,league_name,logo_url");
  const leagueLogoByName = new Map<string, string>();
  for (const row of leagueLogoCache ?? []) {
    if (!row.logo_url || !row.league_name) continue;
    leagueLogoByName.set(`${row.sport}::${row.league_name.toLowerCase()}`, row.logo_url);
  }

  const { data: teamLogoCache } = await supabase
    .from("team_logos").select("sport,league_key,team_name_normalized,logo_url,found");
  const teamLogoByLeagueAndName = new Map<string, string>();
  for (const row of teamLogoCache ?? []) {
    if (!row.logo_url || !row.found || !row.league_key) continue;
    // Logo só é herdada quando o nome exato pertence à mesma liga.
    // Sem fallback global: evita Athletic Club (MG) herdar Athletic Club/Bilbao.
    teamLogoByLeagueAndName.set(`${row.league_key}::${row.team_name_normalized}`, row.logo_url);
  }

  // Normaliza
  const bySport: Record<string, number> = {};
  const normRows: NormalizedEvent[] = [];
  const seenKeys = new Set<string>();
  const nowIso = new Date().toISOString();

  for (const { sportKey, events } of results) {
    const meta = SPORT_KEY_MAP[sportKey];
    if (!meta) continue;
    for (const ev of events) {
      const home: string = ev.home_team;
      const away: string = ev.away_team;
      const commenceStr: string = ev.commence_time;
      if (!home || !away || !commenceStr) continue;
      const commence = new Date(commenceStr);
      if (isNaN(commence.getTime())) continue;

      const sport = meta.internal;
      const canonical_key = buildCanonicalKey(sport, commence, home, away);
      if (seenKeys.has(canonical_key)) continue;
      seenKeys.add(canonical_key);

      const competition_type = inferCompetitionType(meta.league_name);
      const isContinental = competition_type === "continental";
      const country = isContinental ? null : meta.country;
      const continent = isContinental
        ? "Internacional"
        : (country ? COUNTRY_TO_CONTINENT[country] ?? null : null);

      const homeNorm = normTeam(home);
      const awayNorm = normTeam(away);
      const homeLogo = teamLogoByLeagueAndName.get(`${sportKey}::${homeNorm}`) ?? null;
      const awayLogo = teamLogoByLeagueAndName.get(`${sportKey}::${awayNorm}`) ?? null;
      const leagueLogo = leagueLogoByName.get(`${sport}::${meta.league_name.toLowerCase()}`) ?? null;

      bySport[sport] = (bySport[sport] ?? 0) + 1;
      normRows.push({
        canonical_key, sport,
        home_team: home, away_team: away,
        home_team_normalized: homeNorm,
        away_team_normalized: awayNorm,
        home_team_logo: homeLogo,
        away_team_logo: awayLogo,
        league_id: null,
        league_name: meta.league_name,
        league_logo: leagueLogo,
        country, continent,
        competition_type,
        commence_time: commence.toISOString(),
        event_date_brt: brtDateOf(commence),
        status: "scheduled",
        home_score: null, away_score: null,
        venue: null, city: null,
        primary_source: "odds_api",
        sources: {
          odds_api: {
            event_id: ev.id ?? null,
            sport_key: sportKey,
            sport_title: ev.sport_title ?? null,
            updated_at: nowIso,
          },
        },
        last_synced_at: nowIso,
      });
    }
  }

  // ---- UPSERT em lote (merge inteligente para não sobrescrever logos já existentes) ----
  let inserted = 0;
  let updated = 0;
  const keys = normRows.map((r) => r.canonical_key);
  const existingMap = new Map<string, any>();
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    if (!chunk.length) continue;
    const { data: existing } = await supabase
      .from("sports_events")
      .select("canonical_key, sources, home_team_logo, away_team_logo, league_logo")
      .in("canonical_key", chunk);
    for (const row of existing ?? []) existingMap.set(row.canonical_key, row);
  }

  const upsertRows = normRows.map((r) => {
    const ex = existingMap.get(r.canonical_key);
    if (!ex) return r;
    return {
      ...r,
      sources: { ...(ex.sources ?? {}), ...r.sources },
      home_team_logo: ex.home_team_logo ?? r.home_team_logo,
      away_team_logo: ex.away_team_logo ?? r.away_team_logo,
      league_logo: ex.league_logo ?? r.league_logo,
    };
  });

  // Chunked upsert — muito mais rápido que UPDATE linha-a-linha.
  for (let i = 0; i < upsertRows.length; i += 500) {
    const slice = upsertRows.slice(i, i + 500);
    const { error } = await supabase
      .from("sports_events")
      .upsert(slice, { onConflict: "canonical_key", ignoreDuplicates: false });
    if (error) {
      await supabase.from("sports_sync_runs").update({
        status: "error",
        error: `upsert failed: ${error.message}`,
        items_fetched: normRows.length,
        items_upserted: inserted + updated,
        by_sport: bySport,
        cost_usd: 0,
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
      return;
    }
    // Heurística: linhas sem existing prévio contam como inserted; resto como updated.
    for (const r of slice) {
      if (existingMap.has(r.canonical_key)) updated += 1; else inserted += 1;
    }
  }

  await supabase.from("sports_sync_runs").update({
    status: fetchErrors.length === results.length ? "error" : "success",
    items_fetched: normRows.length,
    items_upserted: inserted + updated,
    by_sport: bySport,
    cost_usd: 0,
    error: fetchErrors.length ? JSON.stringify(fetchErrors).slice(0, 1000) : null,
    finished_at: new Date().toISOString(),
  }).eq("id", runId);
}