// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTOR = "azzouzana~sofascore-scraper-pro";
const COST_PER_ITEM_USD = 0.0005; // estimativa conservadora (placeholder)
const HARD_RUN_CAP_USD = 0.5;
const DAILY_CAP_USD = 1.0;

const SPORT_MAP: Record<string, string> = {
  football: "soccer",
  soccer: "soccer",
  basketball: "basketball",
  tennis: "tennis",
  baseball: "baseball",
  "american-football": "americanfootball",
  "american_football": "americanfootball",
  americanfootball: "americanfootball",
  "ice-hockey": "icehockey",
  ice_hockey: "icehockey",
  hockey: "icehockey",
  icehockey: "icehockey",
};

const COUNTRY_TO_CONTINENT: Record<string, string> = {
  Brasil: "América do Sul",
  Brazil: "América do Sul",
  Argentina: "América do Sul",
  Uruguai: "América do Sul",
  Chile: "América do Sul",
  Colômbia: "América do Sul",
  Peru: "América do Sul",
  "Estados Unidos": "América do Norte",
  USA: "América do Norte",
  EUA: "América do Norte",
  México: "América do Norte",
  Canadá: "América do Norte",
  Inglaterra: "Europa",
  England: "Europa",
  Espanha: "Europa",
  Spain: "Europa",
  Itália: "Europa",
  Italy: "Europa",
  Alemanha: "Europa",
  Germany: "Europa",
  França: "Europa",
  France: "Europa",
  Portugal: "Europa",
  Holanda: "Europa",
  Bélgica: "Europa",
  Japão: "Ásia",
  China: "Ásia",
  "Coreia do Sul": "Ásia",
  Austrália: "Oceania",
};

function normalizeSport(raw: any): string | null {
  if (!raw) return null;
  const k = String(raw).toLowerCase().trim();
  return SPORT_MAP[k] ?? k;
}

function pick<T = any>(obj: any, paths: string[]): T | null {
  for (const p of paths) {
    const parts = p.split(".");
    let cur: any = obj;
    let ok = true;
    for (const part of parts) {
      if (cur == null) { ok = false; break; }
      cur = cur[part];
    }
    if (ok && cur != null && cur !== "") return cur as T;
  }
  return null;
}

function inferCompetitionType(name?: string | null): string {
  if (!name) return "league";
  const n = name.toLowerCase();
  if (/(copa|cup|coupe|pokal|taça)/.test(n)) return "cup";
  if (/(champions|libertadores|sudamericana|europa|conference|world|mundial|euro)/.test(n)) {
    return "continental";
  }
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
  source: "sofascore";
  external_ids: Record<string, any>;
}

function normalize(item: any): NormalizedEvent | null {
  // Sport
  const rawSport = pick<string>(item, [
    "sport",
    "tournament.sport.slug",
    "tournament.category.sport.slug",
    "category.sport.slug",
    "uniqueTournament.category.sport.slug",
  ]);
  const sport = normalizeSport(rawSport);
  if (!sport) return null;

  // Event id
  const eventId =
    pick<number | string>(item, ["event.id", "id", "eventId"]) ?? null;
  if (eventId == null) return null;

  // Teams
  const home =
    pick<string>(item, [
      "homeTeam.name",
      "event.homeTeam.name",
      "home.name",
      "homeName",
    ]) ?? null;
  const away =
    pick<string>(item, [
      "awayTeam.name",
      "event.awayTeam.name",
      "away.name",
      "awayName",
    ]) ?? null;
  if (!home || !away) return null;

  // Timestamp (segundos ou string ISO)
  const ts =
    pick<any>(item, [
      "startTimestamp",
      "event.startTimestamp",
      "startTime",
      "kickoff",
    ]) ?? null;
  let commence: Date | null = null;
  if (typeof ts === "number") {
    commence = new Date(ts * (ts < 1e12 ? 1000 : 1));
  } else if (typeof ts === "string") {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) commence = d;
  }
  if (!commence) return null;

  // event_date em America/Sao_Paulo
  const spDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(commence);

  // Tournament / Country
  const utId = pick<number | string>(item, [
    "uniqueTournament.id",
    "tournament.uniqueTournament.id",
    "tournamentId",
  ]);
  const utName =
    pick<string>(item, [
      "uniqueTournament.name",
      "tournament.uniqueTournament.name",
      "tournament.name",
    ]) ?? "—";
  const categoryName =
    pick<string>(item, [
      "category.name",
      "tournament.category.name",
      "uniqueTournament.category.name",
    ]) ?? null;
  const categoryId = pick<number | string>(item, [
    "category.id",
    "tournament.category.id",
    "uniqueTournament.category.id",
  ]);
  const flag =
    pick<string>(item, [
      "category.flag",
      "tournament.category.flag",
      "uniqueTournament.category.flag",
    ]) ?? null;

  // Status
  const statusRaw =
    pick<string>(item, [
      "status.type",
      "event.status.type",
      "statusType",
    ]) ?? null;
  const status =
    statusRaw === "finished"
      ? "finished"
      : statusRaw === "inprogress"
      ? "live"
      : "scheduled";

  const leagueKey = `sofascore_${utId ?? `${sport}_${utName}`}`;

  return {
    api_id: `sofascore_${eventId}`,
    sport,
    league_key: leagueKey,
    league_name: utName,
    league_flag: flag,
    continent: categoryName ? COUNTRY_TO_CONTINENT[categoryName] ?? null : null,
    country: categoryName,
    competition_type: inferCompetitionType(utName),
    home_team: home,
    away_team: away,
    home_team_logo: pick<string>(item, [
      "homeTeam.logo",
      "homeTeam.image",
      "event.homeTeam.logo",
    ]),
    away_team_logo: pick<string>(item, [
      "awayTeam.logo",
      "awayTeam.image",
      "event.awayTeam.logo",
    ]),
    league_logo: pick<string>(item, [
      "uniqueTournament.logo",
      "tournament.logo",
      "uniqueTournament.image",
    ]),
    commence_time: commence.toISOString(),
    event_date: spDate,
    status,
    source: "sofascore",
    external_ids: {
      sofascore_event_id: eventId,
      unique_tournament_id: utId ?? null,
      category_id: categoryId ?? null,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");

  if (!APIFY_TOKEN) {
    return new Response(
      JSON.stringify({ error: "APIFY_TOKEN não configurado" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // identificar usuário (best-effort)
  let triggeredBy: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    try {
      const { data } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", ""),
      );
      triggeredBy = data?.user?.id ?? null;
    } catch { /* ignore */ }
  }

  // Parse input
  let body: any = {};
  try { body = await req.json(); } catch { /* opcional */ }
  const sports: string[] = Array.isArray(body?.sports) && body.sports.length
    ? body.sports
    : ["soccer", "basketball", "tennis", "baseball", "americanfootball", "icehockey"];
  const rawMax = Number(body?.maxItems ?? 200);
  const maxItems = Math.max(10, Math.min(500, isNaN(rawMax) ? 200 : rawMax));

  // Cap diário acumulado
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("sofascore_sync_runs")
    .select("cost_usd")
    .gte("started_at", since);
  const spent = (recent ?? []).reduce(
    (s: number, r: any) => s + Number(r.cost_usd || 0), 0,
  );
  if (spent >= DAILY_CAP_USD) {
    return new Response(JSON.stringify({
      error: "Daily cap atingido",
      spent_usd: spent,
      cap_usd: DAILY_CAP_USD,
    }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Carregar seeds habilitadas
  const { data: seedsRows, error: seedsErr } = await supabase
    .from("sofascore_seeds")
    .select("sport, start_url")
    .eq("enabled", true)
    .in("sport", sports);
  if (seedsErr) {
    return new Response(JSON.stringify({ error: seedsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startUrls = (seedsRows ?? []).map((s: any) => ({ url: s.start_url }));
  if (startUrls.length === 0) {
    return new Response(JSON.stringify({
      error: "Nenhuma seed habilitada para os esportes solicitados",
      requested_sports: sports,
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Cria run
  const { data: runIns, error: runErr } = await supabase
    .from("sofascore_sync_runs")
    .insert({
      status: "running",
      triggered_by: triggeredBy,
      params: { sports, maxItems, seedsCount: startUrls.length },
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

  // Chamar Apify (run-sync-get-dataset-items)
  const apifyUrl =
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&clean=1`;

  let items: any[] = [];
  try {
    const resp = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startUrls, maxItems }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      await supabase.from("sofascore_sync_runs").update({
        status: "error",
        error: `Apify HTTP ${resp.status}: ${text.slice(0, 500)}`,
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
      return new Response(JSON.stringify({
        run_id: runId,
        error: `Apify HTTP ${resp.status}`,
        details: text.slice(0, 500),
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    items = await resp.json();
    if (!Array.isArray(items)) items = [];
  } catch (e: any) {
    await supabase.from("sofascore_sync_runs").update({
      status: "error",
      error: `fetch failed: ${e?.message ?? String(e)}`,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return new Response(JSON.stringify({ run_id: runId, error: String(e?.message ?? e) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const costEstimate = Math.min(
    items.length * COST_PER_ITEM_USD,
    HARD_RUN_CAP_USD,
  );

  // Persistir raw (batched)
  if (items.length) {
    const rawRows = items.map((it) => ({
      source_run_id: runId,
      sport: normalizeSport(pick<string>(it, [
        "sport", "tournament.sport.slug", "category.sport.slug",
      ])),
      unique_tournament_id: pick<number>(it, [
        "uniqueTournament.id", "tournament.uniqueTournament.id",
      ]) ?? null,
      event_id: pick<number>(it, ["event.id", "id", "eventId"]) ?? null,
      payload: it,
    }));
    // chunk de 500
    for (let i = 0; i < rawRows.length; i += 500) {
      const slice = rawRows.slice(i, i + 500);
      await supabase.from("sofascore_events_raw").insert(slice);
    }
  }

  // Normalizar e UPSERT em daily_events
  const bySport: Record<string, number> = {};
  let upserted = 0;
  const normRows: NormalizedEvent[] = [];
  for (const it of items) {
    const n = normalize(it);
    if (!n) continue;
    bySport[n.sport] = (bySport[n.sport] ?? 0) + 1;
    normRows.push(n);
  }

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
        cost_usd: costEstimate,
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
      return new Response(JSON.stringify({
        run_id: runId,
        error: upErr.message,
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    upserted += count ?? slice.length;
  }

  await supabase.from("sofascore_sync_runs").update({
    status: "success",
    items_fetched: items.length,
    items_upserted: upserted,
    by_sport: bySport,
    cost_usd: costEstimate,
    finished_at: new Date().toISOString(),
  }).eq("id", runId);

  return new Response(JSON.stringify({
    run_id: runId,
    items_fetched: items.length,
    items_upserted: upserted,
    by_sport: bySport,
    cost_estimate_usd: costEstimate,
    daily_spent_usd: spent + costEstimate,
    daily_cap_usd: DAILY_CAP_USD,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});