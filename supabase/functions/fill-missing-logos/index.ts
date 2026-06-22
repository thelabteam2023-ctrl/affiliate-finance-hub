// deno-lint-ignore-file no-explicit-any
// Procura logos faltantes em sports_events e tenta preencher usando:
// 1) team_logos (cache local)
// 2) league_logos (cache local)
// 3) TheSportsDB /searchteams.php por nome do time
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TSD_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const MAX_SEARCH_CALLS = 40; // proteção contra runaway

function normTeam(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|cd|sk|if|bk|hc|club|football|futbol|futebol|soccer)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const maxRows = Math.min(Number(body?.maxRows ?? 200), 500);

  // Eventos com logo faltando (priorizando os mais próximos no tempo)
  const { data: events, error } = await supabase
    .from("sports_events")
    .select("id, sport, home_team, away_team, home_team_normalized, away_team_normalized, home_team_logo, away_team_logo, league_logo, league_id")
    .or("home_team_logo.is.null,away_team_logo.is.null,league_logo.is.null")
    .gte("event_date_brt", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
    .order("commence_time", { ascending: true })
    .limit(maxRows);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Pré-carrega cache de team_logos e league_logos relevantes
  const allNorm = new Set<string>();
  const allLeagues = new Set<string>();
  for (const e of events ?? []) {
    if (!e.home_team_logo) allNorm.add(e.home_team_normalized);
    if (!e.away_team_logo) allNorm.add(e.away_team_normalized);
    if (!e.league_logo && e.league_id) allLeagues.add(`thesportsdb_${e.league_id}`);
  }

  const teamCache = new Map<string, string>(); // normalized -> url
  if (allNorm.size) {
    const arr = Array.from(allNorm);
    for (let i = 0; i < arr.length; i += 200) {
      const chunk = arr.slice(i, i + 200);
      const { data } = await supabase
        .from("team_logos")
        .select("team_name_normalized, logo_url")
        .in("team_name_normalized", chunk)
        .not("logo_url", "is", null);
      for (const t of data ?? []) {
        if (t.logo_url && !teamCache.has(t.team_name_normalized)) {
          teamCache.set(t.team_name_normalized, t.logo_url);
        }
      }
    }
  }

  const leagueCache = new Map<string, string>();
  if (allLeagues.size) {
    const arr = Array.from(allLeagues);
    const { data } = await supabase
      .from("league_logos")
      .select("league_key, logo_url")
      .in("league_key", arr)
      .not("logo_url", "is", null);
    for (const l of data ?? []) {
      if (l.logo_url) leagueCache.set(l.league_key, l.logo_url);
    }
  }

  // Resolver: cache primeiro; depois TheSportsDB search (limitado)
  let cacheHits = 0;
  let apiHits = 0;
  let apiMisses = 0;
  const teamSearches = new Map<string, string | null>(); // teamName(original) -> url|null

  async function searchTeamLogo(name: string, normalized: string): Promise<string | null> {
    if (teamSearches.has(name)) return teamSearches.get(name) ?? null;
    if (apiHits + apiMisses >= MAX_SEARCH_CALLS) return null;
    try {
      const r = await fetch(`${TSD_BASE}/searchteams.php?t=${encodeURIComponent(name)}`);
      if (!r.ok) { apiMisses++; teamSearches.set(name, null); return null; }
      const j = await r.json();
      const teams: any[] = Array.isArray(j?.teams) ? j.teams : [];
      // Match por normalização
      const hit = teams.find((t) => normTeam(t.strTeam ?? "") === normalized) ?? teams[0];
      const url: string | null = hit?.strBadge ?? hit?.strTeamBadge ?? null;
      if (url) {
        apiHits++;
        // popular cache
        await supabase.from("team_logos").upsert({
          sport: hit.strSport?.toLowerCase().replace(/\s+/g, "") ?? "unknown",
          team_name_normalized: normalized,
          team_name_original: hit.strTeam ?? name,
          league_key: `thesportsdb_${hit.idLeague ?? "unknown"}`,
          logo_url: url,
          found: true,
          searched_at: new Date().toISOString(),
        }, { onConflict: "league_key,team_name_normalized" });
      } else {
        apiMisses++;
      }
      teamSearches.set(name, url);
      return url;
    } catch {
      apiMisses++; teamSearches.set(name, null); return null;
    }
  }

  let updatedEvents = 0;

  for (const e of events ?? []) {
    const patch: any = {};

    if (!e.home_team_logo) {
      const cached = teamCache.get(e.home_team_normalized);
      if (cached) { patch.home_team_logo = cached; cacheHits++; }
      else {
        const fromApi = await searchTeamLogo(e.home_team, e.home_team_normalized);
        if (fromApi) { patch.home_team_logo = fromApi; teamCache.set(e.home_team_normalized, fromApi); }
      }
    }
    if (!e.away_team_logo) {
      const cached = teamCache.get(e.away_team_normalized);
      if (cached) { patch.away_team_logo = cached; cacheHits++; }
      else {
        const fromApi = await searchTeamLogo(e.away_team, e.away_team_normalized);
        if (fromApi) { patch.away_team_logo = fromApi; teamCache.set(e.away_team_normalized, fromApi); }
      }
    }
    if (!e.league_logo && e.league_id) {
      const cached = leagueCache.get(`thesportsdb_${e.league_id}`);
      if (cached) { patch.league_logo = cached; cacheHits++; }
    }

    if (Object.keys(patch).length) {
      const { error: upErr } = await supabase
        .from("sports_events")
        .update(patch)
        .eq("id", e.id);
      if (!upErr) updatedEvents++;
    }
  }

  return new Response(JSON.stringify({
    scanned: events?.length ?? 0,
    updated_events: updatedEvents,
    cache_hits: cacheHits,
    api_hits: apiHits,
    api_misses: apiMisses,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});