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
      const { data, error } = await supabase
        .from("daily_events")
        .select(
          "id, sport, league_name, league_logo, home_team, away_team, home_team_logo, away_team_logo, commence_time, status, country"
        )
        .eq("event_date", dateKey)
        .order("commence_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DailyEvent[];
    },
  });
}