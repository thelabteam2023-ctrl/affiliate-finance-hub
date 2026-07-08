import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DailyEvent {
  id: string;
  sport: string | null;
  league_name: string | null;
  league_logo: string | null;
  home_team: string;
  away_team: string;
  home_team_logo: string | null;
  away_team_logo: string | null;
  commence_time: string;
  status: string | null;
  country: string | null;
  fixture_key?: string | null;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeTeamName(s: string): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Lista jogos do Explorador de Dados Esportivos (tabela public.daily_events) para uma data.
 * Usado pelo seletor de evento dentro do formulário de Arbitragem.
 */
export function useDailyEventsByDate(date: Date | undefined, enabled = true) {
  const dateKey = date ? toDateKey(date) : toDateKey(new Date());

  return useQuery({
    queryKey: ["daily-events", dateKey],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DailyEvent[]> => {
      // Fonte oficial de jogos = public.sports_events (mesma tabela do /admin/api-explorer).
      // A antiga public.daily_events está estagnada; migramos o picker para a fonte viva
      // mantendo o shape DailyEvent para não impactar consumidores.
      const startISO = `${dateKey}T00:00:00`;
      const nextDay = new Date(`${dateKey}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      const endISO = `${toDateKey(nextDay)}T00:00:00`;

      const { data, error } = await supabase
        .from("sports_events")
        .select(
          "id, canonical_key, sport, league_name, league_logo, home_team, away_team, home_team_logo, away_team_logo, commence_time, country, home_score, away_score"
        )
        .gte("commence_time", startISO)
        .lt("commence_time", endISO)
        .order("commence_time", { ascending: true });
      if (error) throw error;
      const mapped: DailyEvent[] = (data ?? []).map((e: any) => ({
        id: e.id,
        sport: e.sport ?? null,
        league_name: e.league_name ?? null,
        league_logo: e.league_logo ?? null,
        home_team: e.home_team,
        away_team: e.away_team,
        home_team_logo: e.home_team_logo ?? null,
        away_team_logo: e.away_team_logo ?? null,
        commence_time: e.commence_time,
        status: e.home_score != null && e.away_score != null ? "finished" : null,
        country: e.country ?? null,
        fixture_key: e.canonical_key ?? null,
      }));
      // Defesa client-side: deduplica por fixture_key (ou trio sport+commence+times)
      // mantendo a primeira ocorrência (com mais logos preenchidas, depois mais antiga).
      const rows = mapped;
      const seen = new Map<string, DailyEvent>();
      for (const r of rows) {
        const key =
          r.fixture_key ??
          `${(r.sport ?? "").toLowerCase()}|${r.commence_time}|${r.home_team?.toLowerCase()}|${r.away_team?.toLowerCase()}`;
        const prev = seen.get(key);
        if (!prev) {
          seen.set(key, r);
          continue;
        }
        const score = (x: DailyEvent) =>
          (x.home_team_logo ? 1 : 0) + (x.away_team_logo ? 1 : 0) + (x.league_logo ? 1 : 0);
        if (score(r) > score(prev)) seen.set(key, r);
      }
      const deduped = Array.from(seen.values());

      // Hidratação: sports_events frequentemente tem só um dos lados com logo
      // (ex.: Argentina X Egypt → só Argentina). Preenche NULLs a partir do
      // cache local team_logos (mesma tabela usada pelo /admin/api-explorer),
      // agrupando por esporte para reduzir o número de queries.
      const missing = new Map<string, Set<string>>(); // sport -> normalized names
      for (const r of deduped) {
        if (!r.sport) continue;
        if (!r.home_team_logo) {
          const set = missing.get(r.sport) ?? new Set<string>();
          set.add(normalizeTeamName(r.home_team));
          missing.set(r.sport, set);
        }
        if (!r.away_team_logo) {
          const set = missing.get(r.sport) ?? new Set<string>();
          set.add(normalizeTeamName(r.away_team));
          missing.set(r.sport, set);
        }
      }

      if (missing.size > 0) {
        const logoIndex = new Map<string, string>(); // `${sport}|${norm}` -> url
        await Promise.all(
          Array.from(missing.entries()).map(async ([sport, names]) => {
            const list = Array.from(names).filter(Boolean);
            if (list.length === 0) return;
            const { data: logos } = await supabase
              .from("team_logos")
              .select("team_name_normalized, logo_url")
              .eq("sport", sport)
              .in("team_name_normalized", list)
              .not("logo_url", "is", null);
            for (const row of logos ?? []) {
              const key = `${sport}|${(row as any).team_name_normalized}`;
              if (!logoIndex.has(key) && (row as any).logo_url) {
                logoIndex.set(key, (row as any).logo_url as string);
              }
            }
          })
        );

        for (const r of deduped) {
          if (!r.sport) continue;
          if (!r.home_team_logo) {
            const url = logoIndex.get(`${r.sport}|${normalizeTeamName(r.home_team)}`);
            if (url) r.home_team_logo = url;
          }
          if (!r.away_team_logo) {
            const url = logoIndex.get(`${r.sport}|${normalizeTeamName(r.away_team)}`);
            if (url) r.away_team_logo = url;
          }
        }
      }

      return deduped;
    },
  });
}