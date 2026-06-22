// deno-lint-ignore-file no-explicit-any
// Match Results Poller — busca apenas RESULTADOS (placar) na Odds API /scores
// para jogos do dia/ontem que ainda não têm score gravado.
// Estratégia "barata": 1 crédito por sport_key consultado, e só consulta um
// sport_key se existir pelo menos 1 partida pendente naquele sport.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCanonicalKey } from "../_shared/catalogNormalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ODDS_BASE = "https://api.the-odds-api.com/v4";

// Mapeamento sport interno → lista de sport_keys do Odds API consultáveis para /scores.
// Mantemos apenas as ligas mais ativas para economizar créditos.
const SPORT_KEYS_BY_INTERNAL: Record<string, string[]> = {
  soccer: [
    "soccer_brazil_campeonato",
    "soccer_brazil_serie_b",
    "soccer_epl",
    "soccer_spain_la_liga",
    "soccer_italy_serie_a",
    "soccer_germany_bundesliga",
    "soccer_france_ligue_one",
    "soccer_uefa_champs_league",
    "soccer_fifa_world_cup",
    "soccer_usa_mls",
    "soccer_mexico_ligamx",
    "soccer_argentina_primera_division",
    "soccer_conmebol_copa_libertadores",
    "soccer_conmebol_copa_sudamericana",
    "soccer_portugal_primeira_liga",
    "soccer_netherlands_eredivisie",
  ],
  basketball: ["basketball_nba", "basketball_wnba", "basketball_euroleague"],
  baseball: ["baseball_mlb"],
  americanfootball: ["americanfootball_nfl"],
  icehockey: ["icehockey_nhl"],
};

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

  // Cria run
  const { data: runIns, error: runErr } = await supabase
    .from("sports_sync_runs")
    .insert({
      status: "running",
      triggered_by: triggeredBy,
      params: { source: "odds_api_scores" },
    })
    .select("id").single();
  if (runErr) {
    return new Response(JSON.stringify({ error: runErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runIns!.id as string;

  const runWork = async () => {
    try { await doPollWork(supabase, ODDS_API_KEY, runId); }
    catch (e: any) {
      await supabase.from("sports_sync_runs").update({
        status: "error",
        error: (e?.message ?? String(e)).slice(0, 1000),
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
    }
  };
  // @ts-ignore EdgeRuntime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(runWork());
  } else {
    runWork();
  }

  return new Response(JSON.stringify({
    run_id: runId,
    status: "running",
    message: "Poller iniciado em background. Acompanhe via sports_sync_runs.",
  }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

async function doPollWork(supabase: any, ODDS_API_KEY: string, runId: string) {
  // Janela: jogos cujo início caiu nas últimas 48h e ainda não têm score.
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const until = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // tolera relógio

  const { data: pending, error: pendingErr } = await supabase
    .from("sports_events")
    .select("canonical_key, sport, home_team, away_team, commence_time")
    .is("home_score", null)
    .gte("commence_time", since)
    .lte("commence_time", until);

  if (pendingErr) throw pendingErr;
  const pendingRows = pending ?? [];

  // Quais "sports internos" têm pendência? Só consultaremos esses.
  const sportsWithPending = new Set<string>();
  for (const r of pendingRows) if (r.sport) sportsWithPending.add(r.sport);

  // Lista final de sport_keys a consultar.
  const sportKeysToFetch: string[] = [];
  for (const internal of sportsWithPending) {
    const keys = SPORT_KEYS_BY_INTERNAL[internal] ?? [];
    sportKeysToFetch.push(...keys);
  }

  let creditsUsed = 0;
  const errors: any[] = [];
  const allScores: any[] = [];

  // Fetch /scores com pool limitada
  const POOL = 4;
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= sportKeysToFetch.length) return;
      const key = sportKeysToFetch[i];
      const url = `${ODDS_BASE}/sports/${key}/scores?daysFrom=1&apiKey=${ODDS_API_KEY}`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12_000);
      try {
        const r = await fetch(url, { signal: ctrl.signal });
        if (!r.ok) {
          const txt = await r.text();
          errors.push({ sport_key: key, error: `HTTP ${r.status}: ${txt.slice(0, 200)}` });
        } else {
          creditsUsed += 1;
          const arr = await r.json();
          if (Array.isArray(arr)) {
            for (const ev of arr) allScores.push({ ...ev, _sport_key: key });
          }
        }
      } catch (e: any) {
        errors.push({ sport_key: key, error: e?.message ?? String(e) });
      } finally {
        clearTimeout(t);
      }
    }
  }
  await Promise.all(Array.from({ length: POOL }, () => worker()));

  // Indexa scores por canonical_key
  const scoresByKey = new Map<string, { home: number | null; away: number | null; completed: boolean }>();
  for (const ev of allScores) {
    const home = ev.home_team, away = ev.away_team, commenceStr = ev.commence_time;
    if (!home || !away || !commenceStr) continue;
    const commence = new Date(commenceStr);
    if (Number.isNaN(commence.getTime())) continue;
    // Heurística do esporte interno a partir do sport_key
    const internal = (ev._sport_key as string).split("_")[0]
      .replace("americanfootball", "americanfootball");
    const ck = buildCanonicalKey(internal, commence, home, away);

    let hs: number | null = null, as: number | null = null;
    if (Array.isArray(ev.scores)) {
      for (const s of ev.scores) {
        if (s?.name === home) hs = Number(s.score);
        else if (s?.name === away) as = Number(s.score);
      }
    }
    scoresByKey.set(ck, {
      home: Number.isFinite(hs as number) ? hs : null,
      away: Number.isFinite(as as number) ? as : null,
      completed: Boolean(ev.completed),
    });
  }

  // Atualiza apenas os pendentes que casam por canonical_key.
  let updatedCount = 0;
  for (const row of pendingRows) {
    const s = scoresByKey.get(row.canonical_key);
    if (!s) continue;
    if (s.home == null && s.away == null && !s.completed) continue;
    const { error } = await supabase
      .from("sports_events")
      .update({
        home_score: s.home,
        away_score: s.away,
        status: s.completed ? "finished" : "in_progress",
        last_synced_at: new Date().toISOString(),
      })
      .eq("canonical_key", row.canonical_key);
    if (!error) updatedCount += 1;
  }

  await supabase.from("sports_sync_runs").update({
    status: errors.length === sportKeysToFetch.length && sportKeysToFetch.length > 0 ? "error" : "success",
    items_fetched: allScores.length,
    items_upserted: updatedCount,
    by_sport: { sport_keys_polled: sportKeysToFetch.length, pending_input: pendingRows.length },
    cost_usd: creditsUsed * 0.0005, // estimativa conservadora: ~US$0.0005/crédito
    error: errors.length ? JSON.stringify(errors).slice(0, 1000) : null,
    finished_at: new Date().toISOString(),
  }).eq("id", runId);
}