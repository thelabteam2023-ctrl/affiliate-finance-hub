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
      return Array.from(seen.values());
    },
  });
}