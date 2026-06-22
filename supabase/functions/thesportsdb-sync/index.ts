// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// TheSportsDB free public API (key "3"). No cost, no auth.
// GET /api/v1/json/3/eventsday.php?d=YYYY-MM-DD&s=<SportName>
const TSD_KEY = "3";
const TSD_BASE = `https://www.thesportsdb.com/api/v1/json/${TSD_KEY}`;
const MAX_REQUESTS_PER_RUN = 60;

// Our internal sport id -> TheSportsDB sport name
const TSD_SPORT_NAME: Record<string, string> = {
  soccer: "Soccer",
  basketball: "Basketball",
  tennis: "Tennis",
  baseball: "Baseball",
  americanfootball: "American Football",
  icehockey: "Ice Hockey",
};

const TSD_TO_INTERNAL: Record<string, string> = {
  Soccer: "soccer",
  Basketball: "basketball",
  Tennis: "tennis",
  Baseball: "baseball",
  "American Football": "americanfootball",
  "Ice Hockey": "icehockey",
};

const COUNTRY_TO_CONTINENT: Record<string, string> = {
  Brazil: "América do Sul", Argentina: "América do Sul", Uruguay: "América do Sul",
  Chile: "América do Sul", Colombia: "América do Sul", Peru: "América do Sul",
  Ecuador: "América do Sul", Paraguay: "América do Sul", Venezuela: "América do Sul",
  Bolivia: "América do Sul",
  USA: "América do Norte", "United States": "América do Norte",
  Mexico: "América do Norte", Canada: "América do Norte",
  England: "Europa", Scotland: "Europa", Wales: "Europa", Ireland: "Europa",
  Spain: "Europa", Italy: "Europa", Germany: "Europa", France: "Europa",
  Portugal: "Europa", Netherlands: "Europa", Belgium: "Europa",
  Switzerland: "Europa", Austria: "Europa", Poland: "Europa", Russia: "Europa",
  Turkey: "Europa", Greece: "Europa", Sweden: "Europa", Norway: "Europa",
  Denmark: "Europa", Croatia: "Europa", Serbia: "Europa", "Czech Republic": "Europa",
  Ukraine: "Europa", Romania: "Europa",
  Japan: "Ásia", China: "Ásia", "South Korea": "Ásia", "Saudi Arabia": "Ásia",
  UAE: "Ásia", Qatar: "Ásia", India: "Ásia",
  Australia: "Oceania", "New Zealand": "Oceania",
  Egypt: "África", Morocco: "África", Nigeria: "África", "South Africa": "África",
  Algeria: "África", Tunisia: "África", Cameroon: "África", Senegal: "África",
};

function inferCompetitionType(name?: string | null): string {
  if (!name) return "league";
  const n = name.toLowerCase();
  if (/(world cup|mundial|euro|copa am[eé]rica|nations league|olympics)/.test(n)) return "continental";
  if (/(champions|libertadores|sudamericana|europa league|conference league)/.test(n)) return "continental";
  if (/(copa|cup|coupe|pokal|taça|trophy)/.test(n)) return "cup";
  return "league";
}

interface NormalizedEvent {
  api_id: string;
  sport: string;
  league_key: string;
  league_name: string;
  league_flag: string | null;
  continent: string | null;
  country: string | null;
  competition_type: string | null;
  home_team: string;
  away_team: string;
  home_team_logo: string | null;
  away_team_logo: string | null;
  league_logo: string | null;
  commence_time: string;
  event_date: string;
  status: string | null;
  source: "thesportsdb";
  external_ids: Record<string, any>;
}

function parseCommence(ev: any): Date | null {
  // Preferir strTimestamp (UTC ISO sem Z). Fallback dateEvent + strTime.
  const ts: string | null = ev.strTimestamp ?? null;
  if (ts) {
    const iso = /Z|[+-]\d{2}:?\d{2}$/.test(ts) ? ts : `${ts}Z`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  const date: string | null = ev.dateEvent ?? null;
  const time: string | null = ev.strTime ?? null;
  if (date) {
    const d = new Date(`${date}T${time ?? "00:00:00"}Z`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function mapStatus(raw?: string | null): string {
  if (!raw) return "scheduled";
  const s = String(raw).toUpperCase();
  if (["NS", "TBD", "POSTP", "CANC", ""].includes(s)) return "scheduled";
  if (["FT", "AET", "PEN", "AWD", "WO"].includes(s)) return "finished";
  return "live";
}

function normalize(ev: any): NormalizedEvent | null {
  const eventId = ev.idEvent;
  const home = ev.strHomeTeam;
  const away = ev.strAwayTeam;
  const sportName = ev.strSport;
  const sport = TSD_TO_INTERNAL[sportName];
  if (!eventId || !home || !away || !sport) return null;

  const commence = parseCommence(ev);
  if (!commence) return null;

  const event_date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(commence);

  const leagueName: string = ev.strLeague ?? "—";
  const leagueId: string | null = ev.idLeague ?? null;
  const country: string | null = ev.strCountry ?? null;

  return {
    api_id: `thesportsdb_${eventId}`,
    sport,
    league_key: `thesportsdb_${leagueId ?? `${sport}_${leagueName}`}`,
    league_name: leagueName,
    league_flag: null,
    continent: country ? COUNTRY_TO_CONTINENT[country] ?? null : null,
    country,
    competition_type: inferCompetitionType(leagueName),
    home_team: home,
    away_team: away,
    home_team_logo: ev.strHomeTeamBadge ?? null,
    away_team_logo: ev.strAwayTeamBadge ?? null,
    league_logo: ev.strLeagueBadge ?? null,
    commence_time: commence.toISOString(),
    event_date,
    status: mapStatus(ev.strStatus),
    source: "thesportsdb",
    external_ids: {
      thesportsdb_event_id: eventId,
      thesportsdb_league_id: leagueId,
      thesportsdb_home_team_id: ev.idHomeTeam ?? null,
      thesportsdb_away_team_id: ev.idAwayTeam ?? null,
    },
  };
}

function brtDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

  const requestedSports: string[] = Array.isArray(body?.sports) && body.sports.length
    ? body.sports
    : Object.keys(TSD_SPORT_NAME);
  const sportPairs = requestedSports
    .filter((s) => TSD_SPORT_NAME[s])
    .map((s) => ({ sport: s, name: TSD_SPORT_NAME[s] }));

  if (sportPairs.length === 0) {
    return new Response(JSON.stringify({
      error: "Nenhum esporte válido",
      supported: Object.keys(TSD_SPORT_NAME),
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const dates: string[] = Array.isArray(body?.dates) && body.dates.length
    ? body.dates.filter((d: any) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
    : [brtDate(0), brtDate(1)];

  const totalRequests = sportPairs.length * dates.length;
  if (totalRequests > MAX_REQUESTS_PER_RUN) {
    return new Response(JSON.stringify({
      error: `Excede limite de ${MAX_REQUESTS_PER_RUN} requisições por execução (${totalRequests}).`,
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Cria run
  const { data: runIns, error: runErr } = await supabase
    .from("sofascore_sync_runs")
    .insert({
      status: "running",
      triggered_by: triggeredBy,
      params: { source: "thesportsdb", sports: requestedSports, dates, requests: totalRequests },
    })
    .select("id")
    .single();
  if (runErr) {
    return new Response(JSON.stringify({ error: runErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runIns!.id as string;

  // Buscar TheSportsDB em paralelo
  const tasks: Promise<{ sport: string; date: string; events: any[]; error?: string }>[] = [];
  for (const { sport, name } of sportPairs) {
    for (const date of dates) {
      tasks.push((async () => {
        const url = `${TSD_BASE}/eventsday.php?d=${date}&s=${encodeURIComponent(name)}`;
        try {
          const r = await fetch(url, { headers: { "Accept": "application/json" } });
          if (!r.ok) {
            const t = await r.text();
            return { sport, date, events: [], error: `HTTP ${r.status}: ${t.slice(0, 200)}` };
          }
          const j = await r.json();
          const events: any[] = Array.isArray(j?.events) ? j.events : [];
          return { sport, date, events };
        } catch (e: any) {
          return { sport, date, events: [], error: e?.message ?? String(e) };
        }
      })());
    }
  }

  const results = await Promise.all(tasks);
  const fetchErrors = results.filter((r) => r.error).map((r) => ({
    sport: r.sport, date: r.date, error: r.error,
  }));
  const items: any[] = results.flatMap((r) => r.events);

  // Persistir raw
  if (items.length) {
    const rawRows = items.map((it) => ({
      source_run_id: runId,
      sport: TSD_TO_INTERNAL[it.strSport] ?? null,
      unique_tournament_id: it.idLeague ? Number(it.idLeague) || null : null,
      event_id: it.idEvent ? Number(it.idEvent) || null : null,
      payload: it,
    }));
    for (let i = 0; i < rawRows.length; i += 500) {
      await supabase.from("sofascore_events_raw").insert(rawRows.slice(i, i + 500));
    }
  }

  // Normalizar e UPSERT
  const bySport: Record<string, number> = {};
  const normRows: NormalizedEvent[] = [];
  for (const it of items) {
    const n = normalize(it);
    if (!n) continue;
    bySport[n.sport] = (bySport[n.sport] ?? 0) + 1;
    normRows.push(n);
  }

  let upserted = 0;
  for (let i = 0; i < normRows.length; i += 500) {
    const slice = normRows.slice(i, i + 500);
    const { error: upErr, count } = await supabase
      .from("daily_events")
      .upsert(slice, { onConflict: "source,api_id", count: "exact" });
    if (upErr) {
      await supabase.from("sofascore_sync_runs").update({
        status: "error",
        error: `upsert failed: ${upErr.message}`,
        items_fetched: items.length,
        items_upserted: upserted,
        by_sport: bySport,
        cost_usd: 0,
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
      return new Response(JSON.stringify({ run_id: runId, error: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    upserted += count ?? slice.length;
  }

  await supabase.from("sofascore_sync_runs").update({
    status: fetchErrors.length === results.length ? "error" : "success",
    items_fetched: items.length,
    items_upserted: upserted,
    by_sport: bySport,
    cost_usd: 0,
    error: fetchErrors.length ? JSON.stringify(fetchErrors).slice(0, 1000) : null,
    finished_at: new Date().toISOString(),
  }).eq("id", runId);

  return new Response(JSON.stringify({
    run_id: runId,
    source: "thesportsdb",
    dates,
    sports: sportPairs.map((p) => p.sport),
    requests: totalRequests,
    items_fetched: items.length,
    items_upserted: upserted,
    by_sport: bySport,
    fetch_errors: fetchErrors,
    cost_usd: 0,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});