// deno-lint-ignore-file no-explicit-any
// TheSportsDB sync — catálogo de jogos (sem odds).
// Idempotente via canonical_key. Faz UPSERT em sports_events,
// merge em sources, atualiza só logos vazias, e popula caches
// team_logos/league_logos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TSD_KEY = "3"; // chave pública gratuita
const TSD_BASE = `https://www.thesportsdb.com/api/v1/json/${TSD_KEY}`;
const MAX_REQUESTS_PER_RUN = 60;

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
  if (/(world cup|mundial|euro\b|copa am[eé]rica|nations league|olympics|olimp)/.test(n)) return "continental";
  if (/(champions|libertadores|sudamericana|europa league|conference league|afc cup|caf cup|concacaf)/.test(n)) return "continental";
  if (/(copa|cup|coupe|pokal|taça|trophy)/.test(n)) return "cup";
  return "league";
}

function normTeam(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|cd|sk|if|bk|hc|club|football|futbol|futebol|soccer)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function brtDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function parseCommence(ev: any): Date | null {
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
  if (["NS", "TBD", ""].includes(s)) return "scheduled";
  if (["POSTP"].includes(s)) return "postponed";
  if (["CANC"].includes(s)) return "cancelled";
  if (["FT", "AET", "PEN", "AWD", "WO"].includes(s)) return "finished";
  return "live";
}

function buildCanonicalKey(sport: string, commenceUtc: Date, home: string, away: string): string {
  const ts = commenceUtc.toISOString().replace(/[-:T]/g, "").slice(0, 12); // YYYYMMDDHHmm
  const a = normTeam(home);
  const b = normTeam(away);
  // Ordenar para tolerar inversão de mando
  const [t1, t2] = [a, b].sort();
  return `${sport}|${ts}|${t1}_${t2}`;
}

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
  primary_source: "thesportsdb";
  sources: Record<string, any>;
  last_synced_at: string;
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

  const event_date_brt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(commence);

  const leagueName: string = ev.strLeague ?? null;
  const leagueId: string | null = ev.idLeague ?? null;
  const rawCountry: string | null = ev.strCountry ?? null;
  const competition_type = inferCompetitionType(leagueName);
  const isContinental = competition_type === "continental";

  const country = isContinental ? null : rawCountry;
  const continent = isContinental
    ? "Internacional"
    : (rawCountry ? COUNTRY_TO_CONTINENT[rawCountry] ?? null : null);

  const nowIso = new Date().toISOString();

  return {
    canonical_key: buildCanonicalKey(sport, commence, home, away),
    sport,
    home_team: home,
    away_team: away,
    home_team_normalized: normTeam(home),
    away_team_normalized: normTeam(away),
    home_team_logo: ev.strHomeTeamBadge ?? null,
    away_team_logo: ev.strAwayTeamBadge ?? null,
    league_id: leagueId,
    league_name: leagueName,
    league_logo: ev.strLeagueBadge ?? null,
    country,
    continent,
    competition_type,
    commence_time: commence.toISOString(),
    event_date_brt,
    status: mapStatus(ev.strStatus),
    home_score: ev.intHomeScore != null ? Number(ev.intHomeScore) : null,
    away_score: ev.intAwayScore != null ? Number(ev.intAwayScore) : null,
    venue: ev.strVenue ?? null,
    city: ev.strCity ?? null,
    primary_source: "thesportsdb",
    sources: {
      thesportsdb: {
        event_id: eventId,
        league_id: leagueId,
        home_team_id: ev.idHomeTeam ?? null,
        away_team_id: ev.idAwayTeam ?? null,
        updated_at: nowIso,
      },
    },
    last_synced_at: nowIso,
  };
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

  // Default: ontem + hoje + amanhã + depois (4 dias rolling)
  const dates: string[] = Array.isArray(body?.dates) && body.dates.length
    ? body.dates.filter((d: any) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
    : [brtDate(-1), brtDate(0), brtDate(1), brtDate(2)];

  const totalRequests = sportPairs.length * dates.length;
  if (totalRequests > MAX_REQUESTS_PER_RUN) {
    return new Response(JSON.stringify({
      error: `Excede limite de ${MAX_REQUESTS_PER_RUN} requisições (${totalRequests}).`,
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Cria run em sports_sync_runs
  const { data: runIns, error: runErr } = await supabase
    .from("sports_sync_runs")
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

  // Fetch paralelo
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
  const fetchErrors = results.filter((r) => r.error)
    .map((r) => ({ sport: r.sport, date: r.date, error: r.error }));
  const items: any[] = results.flatMap((r) => r.events);

  // Raw payload (auditoria)
  if (items.length) {
    const rawRows = items.map((it) => ({
      source_run_id: runId,
      sport: TSD_TO_INTERNAL[it.strSport] ?? null,
      unique_tournament_id: it.idLeague ? Number(it.idLeague) || null : null,
      event_id: it.idEvent ? Number(it.idEvent) || null : null,
      payload: it,
    }));
    for (let i = 0; i < rawRows.length; i += 500) {
      await supabase.from("sports_events_raw").insert(rawRows.slice(i, i + 500));
    }
  }

  // Normaliza
  const bySport: Record<string, number> = {};
  const normRows: NormalizedEvent[] = [];
  const seenKeys = new Set<string>();
  for (const it of items) {
    const n = normalize(it);
    if (!n) continue;
    if (seenKeys.has(n.canonical_key)) continue; // dedup dentro do mesmo run
    seenKeys.add(n.canonical_key);
    bySport[n.sport] = (bySport[n.sport] ?? 0) + 1;
    normRows.push(n);
  }

  // ---- UPSERT manual com merge inteligente em sports_events ----
  // Estratégia: SELECT existentes pelos canonical_keys -> calcula delta:
  //   - novos: INSERT
  //   - existentes: UPDATE com COALESCE em logos (não sobrescreve com null/empty)
  //                 e merge de sources jsonb.
  let inserted = 0;
  let updated = 0;

  const keys = normRows.map((r) => r.canonical_key);
  let existingMap = new Map<string, any>();
  if (keys.length) {
    // chunk para evitar URL gigante
    for (let i = 0; i < keys.length; i += 200) {
      const chunk = keys.slice(i, i + 200);
      const { data: existing } = await supabase
        .from("sports_events")
        .select("canonical_key, home_team_logo, away_team_logo, league_logo, sources, first_seen_at")
        .in("canonical_key", chunk);
      for (const row of existing ?? []) existingMap.set(row.canonical_key, row);
    }
  }

  const toInsert: any[] = [];
  const toUpdate: { canonical_key: string; patch: any }[] = [];

  for (const r of normRows) {
    const ex = existingMap.get(r.canonical_key);
    if (!ex) {
      toInsert.push(r);
    } else {
      const mergedSources = { ...(ex.sources ?? {}), ...r.sources };
      const patch: any = {
        // sempre atualiza dados voláteis
        status: r.status,
        home_score: r.home_score,
        away_score: r.away_score,
        commence_time: r.commence_time,
        event_date_brt: r.event_date_brt,
        venue: r.venue,
        city: r.city,
        league_id: r.league_id,
        league_name: r.league_name,
        country: r.country,
        continent: r.continent,
        competition_type: r.competition_type,
        home_team: r.home_team,
        away_team: r.away_team,
        home_team_normalized: r.home_team_normalized,
        away_team_normalized: r.away_team_normalized,
        sources: mergedSources,
        last_synced_at: r.last_synced_at,
        // logos: só atualiza se a nova tem valor E a antiga está vazia
        home_team_logo: ex.home_team_logo ?? r.home_team_logo,
        away_team_logo: ex.away_team_logo ?? r.away_team_logo,
        league_logo: ex.league_logo ?? r.league_logo,
      };
      toUpdate.push({ canonical_key: r.canonical_key, patch });
    }
  }

  // INSERT em chunks
  for (let i = 0; i < toInsert.length; i += 500) {
    const slice = toInsert.slice(i, i + 500);
    const { error } = await supabase.from("sports_events").insert(slice);
    if (error) {
      await supabase.from("sports_sync_runs").update({
        status: "error",
        error: `insert failed: ${error.message}`,
        items_fetched: items.length,
        items_upserted: inserted + updated,
        by_sport: bySport,
        cost_usd: 0,
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
      return new Response(JSON.stringify({ run_id: runId, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    inserted += slice.length;
  }

  // UPDATE um por um (Supabase JS não tem update em lote por chaves diferentes)
  for (const u of toUpdate) {
    const { error } = await supabase
      .from("sports_events")
      .update(u.patch)
      .eq("canonical_key", u.canonical_key);
    if (!error) updated += 1;
  }

  // ---- Cache de logos ----
  const leagueLogoMap = new Map<string, any>();
  const teamLogoMap = new Map<string, any>();
  for (const ev of items) {
    const sport = TSD_TO_INTERNAL[ev.strSport];
    if (!sport) continue;
    const leagueId = ev.idLeague ?? null;
    const leagueName: string = ev.strLeague ?? "—";
    const leagueKey = `thesportsdb_${leagueId ?? `${sport}_${leagueName}`}`;

    if (ev.strLeagueBadge) {
      const k = `${sport}::${leagueKey}`;
      if (!leagueLogoMap.has(k)) {
        leagueLogoMap.set(k, {
          sport, league_key: leagueKey, league_name: leagueName,
          logo_url: ev.strLeagueBadge, found: true,
          searched_at: new Date().toISOString(),
        });
      }
    }
    for (const side of ["Home", "Away"] as const) {
      const teamName = ev[`str${side}Team`];
      const badge = ev[`str${side}TeamBadge`];
      if (!teamName || !badge) continue;
      const normalized = normTeam(teamName);
      if (!normalized) continue;
      const k = `${leagueKey}::${normalized}`;
      if (!teamLogoMap.has(k)) {
        teamLogoMap.set(k, {
          sport, team_name_normalized: normalized,
          team_name_original: teamName, league_key: leagueKey,
          logo_url: badge, found: true,
          searched_at: new Date().toISOString(),
        });
      }
    }
  }

  let leagueLogosUpserted = 0;
  let teamLogosUpserted = 0;
  const leagueLogoRows = Array.from(leagueLogoMap.values());
  const teamLogoRows = Array.from(teamLogoMap.values());

  for (let i = 0; i < leagueLogoRows.length; i += 500) {
    const slice = leagueLogoRows.slice(i, i + 500);
    const { error, count } = await supabase
      .from("league_logos")
      .upsert(slice, { onConflict: "sport,league_key", count: "exact" });
    if (!error) leagueLogosUpserted += count ?? slice.length;
  }
  for (let i = 0; i < teamLogoRows.length; i += 500) {
    const slice = teamLogoRows.slice(i, i + 500);
    const { error, count } = await supabase
      .from("team_logos")
      .upsert(slice, { onConflict: "league_key,team_name_normalized", count: "exact" });
    if (!error) teamLogosUpserted += count ?? slice.length;
  }

  await supabase.from("sports_sync_runs").update({
    status: fetchErrors.length === results.length ? "error" : "success",
    items_fetched: items.length,
    items_upserted: inserted + updated,
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
    inserted,
    updated,
    by_sport: bySport,
    league_logos_upserted: leagueLogosUpserted,
    team_logos_upserted: teamLogosUpserted,
    fetch_errors: fetchErrors,
    cost_usd: 0,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});